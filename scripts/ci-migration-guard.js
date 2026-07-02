#!/usr/bin/env node
// scripts/ci-migration-guard.js
// Blocks a PR that touches a migration file for a protected table unless the
// commit message (any commit in range) contains the literal tag "[reviewed]".
// Protected tables mirror the CLAUDE.md hard rule: users, linked_accounts,
// transactions, session.

const { execSync } = require('child_process');

const BASE_REF = process.env.BASE_REF || 'HEAD~1';
const PROTECTED_NAME_HINTS = ['users', 'linked_accounts', 'linked-accounts', 'transactions', 'session'];

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function hasBase() {
  try {
    sh(`git rev-parse ${BASE_REF}`);
    return true;
  } catch (e) {
    return false;
  }
}

if (!hasBase()) {
  console.log('ci-migration-guard: no base ref available — skipping.');
  process.exit(0);
}

const changedFiles = sh(`git diff --name-only --diff-filter=ACM ${BASE_REF}...HEAD`)
  .split('\n')
  .filter(Boolean);

const touchedMigrations = changedFiles.filter((f) => f.startsWith('migrations/'));
if (!touchedMigrations.length) {
  console.log('ci-migration-guard: no migration files touched.');
  process.exit(0);
}

// A migration file can also touch a protected table by content (CREATE/ALTER
// TABLE) even if its filename doesn't obviously say so — check both.
const protectedTouched = [];
for (const f of touchedMigrations) {
  const nameHit = PROTECTED_NAME_HINTS.some((h) => f.toLowerCase().includes(h));
  let contentHit = false;
  try {
    const diff = sh(`git diff ${BASE_REF}...HEAD -- "${f}"`);
    contentHit = PROTECTED_NAME_HINTS.some((h) =>
      new RegExp('(CREATE|ALTER)\\s+TABLE[^;]*\\b' + h.replace('-', '[_-]') + '\\b', 'i').test(diff)
    );
  } catch (e) { /* file may be deleted; ignore */ }
  if (nameHit || contentHit) protectedTouched.push(f);
}

if (!protectedTouched.length) {
  console.log('ci-migration-guard: migrations touched, none look protected:', touchedMigrations.join(', '));
  process.exit(0);
}

const commitMessages = sh(`git log --format=%B ${BASE_REF}...HEAD`);
if (commitMessages.includes('[reviewed]')) {
  console.log('ci-migration-guard: protected migration(s) touched, [reviewed] tag present:', protectedTouched.join(', '));
  process.exit(0);
}

console.error('ci-migration-guard: BLOCKED');
console.error('The following migration(s) touch a protected table (users/linked_accounts/transactions/session):');
protectedTouched.forEach((f) => console.error('  - ' + f));
console.error('Add "[reviewed]" to a commit message in this PR after a human has reviewed the migration.');
process.exit(1);
