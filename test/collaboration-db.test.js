'use strict';

// Opt-in PostgreSQL contract test. It recreates only a local *_test database.
const assert = require('assert');
const { Pool } = require('pg');
const migration = require('../migrations/1756200000000_build8_collaboration');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('↷ Build 8 PostgreSQL contract skipped: set DATABASE_URL to a local *_test database');
    return;
  }
  let url;
  try {
    url = new URL(process.env.DATABASE_URL);
  } catch {
    throw new Error('Refusing to run: DATABASE_URL must target a local database ending in _test');
  }
  if (!new Set(['localhost', '127.0.0.1', '::1']).has(url.hostname) || !url.pathname.endsWith('_test')) {
    throw new Error('Refusing to run: DATABASE_URL must target a local database ending in _test');
  }

  const admin = new Pool({ connectionString: url.toString() });
  try {
    await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await admin.query(`
      CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT
      );
      CREATE TABLE vault_files (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'vault', filename TEXT NOT NULL, mime TEXT,
        size_bytes INTEGER NOT NULL DEFAULT 0, content BYTEA NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await require('../migrations/1756000000000_collaboration_extensibility').up(admin);
    await migration.up(admin);
    await require('../migrations/1750800000000_asset_tables').up(admin);
    await require('../migrations/1755500000000_canonical_wealth').up(admin);
    await require('../migrations/1757430000074_household_ownership').up(admin);

    const firstUser = (await admin.query("INSERT INTO users(email,name) VALUES('owner@example.com','Owner') RETURNING id")).rows[0].id;
    const secondUser = (await admin.query("INSERT INTO users(email,name) VALUES('adviser@example.com','Adviser') RETURNING id")).rows[0].id;
    const thirdUser = (await admin.query("INSERT INTO users(email,name) VALUES('other@example.com','Other') RETURNING id")).rows[0].id;
    const firstFile = (await admin.query(
      `INSERT INTO vault_files(user_id,filename,content) VALUES($1,'owner-tax.pdf','owner bytes') RETURNING id`, [firstUser]
    )).rows[0].id;
    const secondFile = (await admin.query(
      `INSERT INTO vault_files(user_id,filename,content) VALUES($1,'other-tax.pdf','other bytes') RETURNING id`, [secondUser]
    )).rows[0].id;

    process.env.DATABASE_URL = url.toString();
    const collaboration = require('../db/collaboration');
    const household = await collaboration.createHousehold(firstUser, '  Family wealth ');
    assert.equal((await collaboration.listHouseholds(secondUser)).length, 0, 'membership must not be implicit');
    assert.equal(await collaboration.getHousehold(household.id, secondUser), null, 'non-members cannot inspect a household');
    assert.ok(await collaboration.addMember(household.id, firstUser, secondUser, 50));
    assert.equal((await collaboration.getHousehold(household.id, secondUser)).members.length, 2);
    assert.equal(await collaboration.addMember(household.id, secondUser, thirdUser), null, 'members cannot manage membership');
    assert.equal(await collaboration.updateMemberOwnership(household.id, secondUser, thirdUser, 25), null);
    assert.equal((await collaboration.updateMemberOwnership(household.id, firstUser, secondUser, 60)).ownership, '60.00');
    assert.equal(await collaboration.removeMember(household.id, secondUser, thirdUser), null);

    const otherHousehold = await collaboration.createHousehold(firstUser, 'Second household');
    const subject = 'financial_account:1';
    await admin.query(
      `INSERT INTO valuations (user_id,subject_type,subject_key,classification,amount_minor,currency,as_of,source,confidence)
       VALUES ($1,'financial_account',$2,'cash',10000,'AUD',NOW(),'manual',1)`, [firstUser, subject]
    );
    const label = (await admin.query(
      `INSERT INTO ownership_interests (user_id,subject_type,subject_key,owner_type,ownership_percent,effective_from)
       VALUES ($1,'financial_account',$2,'joint',100,NOW() - INTERVAL '1 day') RETURNING id`, [firstUser, subject]
    )).rows[0];
    const allocation = [{ userId: firstUser, ownershipPercent: 100 }];
    const update = (id) => collaboration.replaceHouseholdOwnership(id, firstUser, firstUser, 'financial_account', subject, allocation);
    const [old] = await update(household.id);
    const [retained] = await update(otherHousehold.id);
    const [replacement] = await update(household.id);
    const result = await admin.query(
      'SELECT id,effective_to FROM ownership_interests WHERE user_id = $1 AND subject_key = $2', [firstUser, subject]
    );
    const byId = new Map(result.rows.map(row => [row.id, row]));
    assert.ok(byId.get(old.id).effective_to, 'previous allocation in the selected household closed');
    for (const row of [retained, label, replacement]) {
      assert.equal(byId.get(row.id).effective_to, null, 'other-household allocation and standalone label remain active');
    }
    const personal = await require('../db/canonical-wealth').listOwnershipInterests(firstUser, 'financial_account', subject);
    assert.deepEqual(personal.map(row => row.id), [label.id], 'personal wealth exposes only the standalone label');
    const snapshot = await collaboration.getHouseholdCanonicalSnapshot(household.id, secondUser);
    assert.deepEqual(snapshot.ownershipInterests.map(row => row.id), [replacement.id]);
    assert.equal(await collaboration.getHouseholdCanonicalSnapshot(otherHousehold.id, secondUser), null);


    const grant = await collaboration.createGrant(firstUser, {
      email: 'adviser@example.com', role: 'adviser', scopes: ['overview', 'documents'], expiresAt: '2099-01-01T00:00:00Z',
    });
    assert.equal(await collaboration.getReadAccess(secondUser, firstUser, 'overview'), null, 'pending grants do not grant access');
    assert.ok(await collaboration.acceptGrant(grant.id, secondUser));
    assert.ok(await collaboration.getReadAccess(secondUser, firstUser, 'overview'));
    assert.equal(await collaboration.getReadAccess(secondUser, firstUser, 'transactions'), null, 'ungranted scopes stay blocked');
    assert.equal((await collaboration.getReadAccess(firstUser, firstUser, 'tax_export')).owner, true);

    const linked = await collaboration.linkDocument(firstUser, {
      vaultFileId: firstFile, taxYear: 2026, documentType: 'Income statement',
    });
    assert.ok(linked);
    assert.equal(await collaboration.linkDocument(firstUser, { vaultFileId: secondFile, taxYear: 2026, documentType: 'Other' }), null, 'cross-user vault links are rejected');
    assert.equal((await collaboration.listDocuments(secondUser)).length, 0);
    assert.equal((await collaboration.getSharedDocument(firstUser, linked.id)).content.toString(), 'owner bytes');
    assert.equal(await collaboration.unlinkDocument(secondUser, linked.id), null, 'document links are owner-scoped');
    assert.ok(await collaboration.revokeGrant(firstUser, grant.id));
    assert.equal(await collaboration.getReadAccess(secondUser, firstUser, 'overview'), null, 'revocation is effective immediately');

    console.log('✓ Build 8 PostgreSQL contract: household, grants, document links and tenant boundaries');
  } finally {
    if (global.__maalPool) await global.__maalPool.end();
    await admin.end();
    delete global.__maalPool;
    delete process.env.DATABASE_URL;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
