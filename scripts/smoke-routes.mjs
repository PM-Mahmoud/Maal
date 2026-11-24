import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../public/app/route-manifest.json', import.meta.url)));
const knownFailures = JSON.parse(await readFile(new URL('./smoke-known-failures.json', import.meta.url)));
const sampleParams = { threadId: '1' }; // The synthetic advisor thread in preview-static.
const viewports = [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
];
if (!Array.isArray(manifest.paths) || manifest.paths.length === 0) {
  throw new Error('The checked-in route manifest has no paths.');
}

const preview = spawn(process.execPath, ['scripts/preview-static.js'], {
  cwd: root,
  env: { ...process.env, PORT: '0', MAAL_PREVIEW_HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const previewClosed = new Promise((resolve) => preview.once('close', resolve));
const previewLogs = createInterface({ input: preview.stdout });
let browser;

function resolvePath(template) {
  return template.replace(/\$([^/]+)/g, (_, name) => {
    if (!Object.hasOwn(sampleParams, name)) {
      throw new Error(`Define a synthetic preview value for ${name} in ${template}`);
    }
    return encodeURIComponent(sampleParams[name]);
  });
}

function previewOrigin() {
  const ready = new Promise((resolve, reject) => {
    preview.once('error', reject);
    preview.once('close', (code) => reject(new Error(`Preview exited with code ${code} before startup`)));
    previewLogs.on('line', (line) => {
      const port = /^Preview on http:\/\/[^:]+:(\d+)$/.exec(line)?.[1];
      if (port) resolve(`http://127.0.0.1:${port}`);
      else console.log(line);
    });
  });
  return Promise.race([
    ready,
    setTimeout(10_000, null, { ref: false }).then(() => {
      throw new Error('Preview did not start within 10 seconds');
    }),
  ]);
}

async function checkPage({ template, viewport }, origin) {
  const path = resolvePath(template);
  const page = await browser.newPage({ viewport });
  const failures = new Set();
  const isLocal = (url) => url.startsWith(origin + '/');
  const localPath = (url) => new URL(url).pathname;

  // The preview must work offline. Block third-party resources so their
  // availability cannot change the result, and retain every local failure.
  await page.route('**/*', (route) => isLocal(route.request().url()) ? route.continue() : route.abort());
  page.on('console', (message) => {
    const { url } = message.location();
    if (message.type() === 'error' && (!url || isLocal(url))) {
      failures.add(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => failures.add(`page: ${error.message}`));
  page.on('response', (response) => {
    if (isLocal(response.url()) && response.status() >= 400) {
      failures.add(`HTTP ${response.status()}: ${response.request().method()} ${localPath(response.url())}`);
    }
  });
  page.on('requestfailed', (request) => {
    const error = request.failure()?.errorText;
    if (isLocal(request.url()) && error !== 'net::ERR_ABORTED') {
      failures.add(`request: ${request.method()} ${localPath(request.url())} (${error})`);
    }
  });

  try {
    await page.goto(origin + path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => {
      const spa = document.getElementById('root');
      return Boolean(spa ? spa.childElementCount : document.body?.childElementCount);
    }, undefined, { timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    const rendered = await page.evaluate(() => {
      const spa = document.getElementById('root');
      return Boolean(spa ? spa.childElementCount : document.body.childElementCount);
    });
    if (!rendered) failures.add('page: rendered content missing');
    if (viewport.width === 375) {
      const overflows = await page.evaluate(() => (
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      ));
      if (overflows) failures.add('layout: horizontal overflow');
    }
  } catch (error) {
    failures.add(`navigation: ${error.message}`);
  } finally {
    await page.close();
  }

  return { template, width: viewport.width, failures: [...failures] };
}

try {
  const origin = await previewOrigin();
  browser = await chromium.launch({ executablePath: process.env.MAAL_CHROMIUM_PATH });
  const checks = manifest.paths.flatMap((template) => viewports.map((viewport) => ({ template, viewport })));
  let failed = 0;
  // Bounded parallelism keeps the runtime short without opening 100+ pages at once.
  for (let i = 0; i < checks.length; i += 2) {
    const results = await Promise.all(checks.slice(i, i + 2).map((check) => checkPage(check, origin)));
    for (const { template, width, failures } of results) {
      const unexpected = failures.filter((failure) => {
        const known = knownFailures.find((entry) => entry.path === template && entry.width === width && entry.failure === failure);
        if (!known) return true;
        console.warn(`${width}px ${template} - known issue ${known.issue}`);
        return false;
      });
      if (!unexpected.length) continue;
      failed += 1;
      for (const failure of unexpected) console.error(`${width}px ${template} - ${failure}`);
    }
  }
  console.log(`Checked ${manifest.paths.length} routes at ${viewports.length} widths. ${failed} of ${checks.length} checks failed.`);
  if (failed) process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } finally {
    preview.kill();
    await previewClosed;
  }
}
