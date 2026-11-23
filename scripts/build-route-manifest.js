#!/usr/bin/env node
'use strict';
// Writes public/app/route-manifest.json: every client route path from
// client/src/routeTree.gen.ts. Runs after `vite build` (client/package.json
// "build"), because Vite empties public/app first. server.js reads the file to
// send real 404s for unknown pages (lib/app-routes.js).
//
//   node scripts/build-route-manifest.js [routeTree.gen.ts] [out.json]

const fs = require('fs');
const path = require('path');
const { extractFullPaths } = require('../lib/app-routes');

const root = path.join(__dirname, '..');
const src = process.argv[2] || path.join(root, 'client', 'src', 'routeTree.gen.ts');
const out = process.argv[3] || path.join(root, 'public', 'app', 'route-manifest.json');

const paths = extractFullPaths(fs.readFileSync(src, 'utf8'));
if (!paths.length) {
  console.error(`[route-manifest] No routes found in ${src}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ source: 'client/src/routeTree.gen.ts', paths }, null, 2) + '\n');
console.log(`[route-manifest] ${paths.length} routes → ${path.relative(root, out)}`);
