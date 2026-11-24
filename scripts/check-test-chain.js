'use strict';

const fs = require('node:fs');
const path = require('node:path');
const project = path.resolve(__dirname, '..');
const { scripts } = require('../package.json');

const references = new Set(Object.values(scripts).flatMap((command) =>
  [...command.matchAll(/(?:^|[\s'"=])(?:\.\/)?(test\/[\w.-]+\.test\.js)(?=$|[\s'";&|])/g)].map((match) => match[1])
));
const tests = fs.readdirSync(path.join(project, 'test'), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
  .map((entry) => `test/${entry.name}`);
const missing = tests.filter((test) => !references.has(test)).sort();

if (missing.length) {
  console.error('Test files missing from package.json scripts:');
  for (const test of missing) console.error(`  ${test}`);
  process.exitCode = 1;
} else {
  console.log(`All ${tests.length} test files are referenced by npm scripts.`);
}
