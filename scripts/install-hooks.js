// scripts/install-hooks.js
// Copies .claude/hooks/* into .git/hooks/* so they run automatically.
// .git/hooks is not tracked by git, so this runs on every `npm install`
// (see package.json "prepare" script) to keep hooks in sync with the repo.

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', '.claude', 'hooks');
const destDir = path.join(__dirname, '..', '.git', 'hooks');

if (!fs.existsSync(srcDir)) process.exit(0);
if (!fs.existsSync(destDir)) process.exit(0); // not a git checkout (e.g. CI archive)

for (const name of fs.readdirSync(srcDir)) {
  const src = path.join(srcDir, name);
  const dest = path.join(destDir, name);
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  console.log(`installed hook: ${name}`);
}
