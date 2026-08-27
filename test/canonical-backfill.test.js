'use strict';

const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync(require.resolve('../scripts/backfill-canonical-wealth'), 'utf8');
const holdingsUpsert = source.match(/INSERT INTO holdings[\s\S]*?row\.legacyKey\]/);
assert.ok(holdingsUpsert, 'canonical backfill must keep a holdings upsert');
assert.ok(!holdingsUpsert[0].includes('EXCLUDED.owner_type'), 'holdings must not update ownership columns');
assert.ok(!holdingsUpsert[0].includes('EXCLUDED.ownership_percent'), 'holdings must not update ownership percentages');
assert.match(source, /INSERT INTO ownership_interests/, 'ownership must be persisted in ownership_interests');

console.log('✓ canonical backfill keeps holdings and ownership upserts on their correct tables');
