'use strict';

// Opt-in PostgreSQL contract test. It recreates the public schema and therefore
// refuses remote databases and database names that do not end in `_test`.
const assert = require('assert');
const { Pool } = require('pg');

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(url.hostname) || !url.pathname.endsWith('_test')) {
    throw new Error('Refusing to run: DATABASE_URL must target a local database ending in _test');
  }
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = 'test-only-provider-key-with-stable-entropy';
  const admin = new Pool({ connectionString: url.toString() });
  try {
    await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await admin.query(`
      CREATE TABLE users (id BIGSERIAL PRIMARY KEY);
      CREATE TABLE linked_accounts (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        institution_name TEXT, institution_type TEXT, account_reference TEXT,
        balance NUMERIC, connection_status TEXT
      );
      CREATE TABLE transactions (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        basiq_id TEXT, description TEXT, amount NUMERIC, status TEXT, post_date DATE
      );
      CREATE UNIQUE INDEX idx_transactions_user_basiq
        ON transactions(user_id, basiq_id) WHERE basiq_id IS NOT NULL;
      CREATE TABLE transaction_provider_details (
        transaction_id BIGINT PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
        user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        account_reference TEXT NOT NULL, observed_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE financial_accounts (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        account_type TEXT, name TEXT, institution TEXT, external_reference TEXT,
        currency CHAR(3), source TEXT, confidence NUMERIC, as_of TIMESTAMPTZ,
        legacy_key TEXT, metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(id,user_id), UNIQUE(user_id,legacy_key)
      );
      CREATE TABLE canonical_account_links (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT, external_account_id TEXT, financial_account_id BIGINT,
        match_method TEXT, confidence NUMERIC, status TEXT, last_seen_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id,provider,external_account_id)
      );
      CREATE TABLE instruments (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        name TEXT, instrument_type TEXT, ticker TEXT, isin TEXT, exchange TEXT, currency CHAR(3),
        legacy_key TEXT, match_key TEXT, metadata JSONB DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(id,user_id), UNIQUE(user_id,legacy_key)
      );
      CREATE UNIQUE INDEX idx_instruments_user_match_key
        ON instruments(user_id,match_key) WHERE match_key IS NOT NULL;
      CREATE UNIQUE INDEX idx_instruments_user_isin
        ON instruments(user_id,isin) WHERE isin IS NOT NULL;
      CREATE TABLE holdings (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        financial_account_id BIGINT, instrument_id BIGINT, units NUMERIC(28,10),
        cost_basis_minor BIGINT, currency CHAR(3), as_of TIMESTAMPTZ, source TEXT,
        confidence NUMERIC, legacy_key TEXT, updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id,legacy_key), UNIQUE(user_id,financial_account_id,instrument_id,as_of)
      );
      CREATE TABLE valuations (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        subject_type TEXT, subject_key TEXT, classification TEXT, amount_minor BIGINT,
        currency CHAR(3), as_of TIMESTAMPTZ, source TEXT, confidence NUMERIC,
        legacy_key TEXT, metadata JSONB DEFAULT '{}', UNIQUE(user_id,legacy_key)
      );
      CREATE TABLE ownership_interests (
        id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        subject_type TEXT, subject_key TEXT, owner_type TEXT, ownership_percent NUMERIC,
        effective_from TIMESTAMPTZ, effective_to TIMESTAMPTZ,
        legacy_key TEXT, updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id,legacy_key)
      );
    `);
    await require('../migrations/1755400000000_provider_connections').up(admin);
    const userId = (await admin.query('INSERT INTO users DEFAULT VALUES RETURNING id')).rows[0].id;

    const connections = require('../db/provider-connections');
    await connections.upsertConnection(userId, 'lunchflow', {
      user_id: 'lf-user', access_token: 'plain-access', refresh_token: 'plain-refresh', expires_in: 3600,
    });
    const stored = (await admin.query('SELECT * FROM provider_connections WHERE user_id=$1', [userId])).rows[0];
    assert(!stored.access_token_encrypted.includes('plain-access'));
    assert(!stored.refresh_token_encrypted.includes('plain-refresh'));
    const restored = await connections.getConnection(userId, 'lunchflow');
    assert.equal(restored.access_token, 'plain-access');
    assert.equal(restored.refresh_token, 'plain-refresh');

    const accountId = (await admin.query(
      `INSERT INTO financial_accounts
         (user_id,account_type,name,currency,source,confidence,as_of)
       VALUES ($1,'brokerage','Broker','AUD','lunchflow',0.95,NOW()) RETURNING id`,
      [userId]
    )).rows[0].id;
    await admin.query(
      `INSERT INTO canonical_account_links
         (user_id,provider,external_account_id,financial_account_id,match_method,confidence,status,last_seen_at)
       VALUES ($1,'lunchflow','broker-1',$2,'provider_reference',0.95,'active',NOW())`,
      [userId, accountId]
    );
    const imports = require('../db/lunchflow-import');
    await imports.upsertTransactions(userId, [{
      provider_id: 'lunchflow:stale', account_reference: 'lunchflow:broker-1',
      amount: -1, status: 'posted', post_date: '2026-08-01', description: 'stale',
    }]);
    const mirror = await imports.upsertTransactions(userId, [{
      provider_id: 'lunchflow:current', account_reference: 'lunchflow:broker-1',
      amount: -2, status: 'posted', post_date: '2026-08-02', description: 'current',
    }], { windowStart: '2026-04-09', accountReferences: ['lunchflow:broker-1'] });
    assert.equal(mirror.stale_removed, 1);
    assert.deepStrictEqual(
      (await admin.query(`SELECT basiq_id FROM transactions ORDER BY basiq_id`)).rows.map((row) => row.basiq_id),
      ['lunchflow:current']
    );

    await admin.query(
      `INSERT INTO instruments
         (user_id,name,instrument_type,isin,currency,legacy_key)
       VALUES ($1,'Existing VAS','listed_security','AU000000VAS1','AUD','manual:vas')`,
      [userId]
    );
    const mappedHolding = {
      account_reference: 'lunchflow:broker-1', holding_key: 'isin:AU000000VAS1',
      name: 'VAS', ticker: 'VAS', isin: 'AU000000VAS1', figi: null,
      exchange: 'ASX', currency: 'AUD', units: '2.5', price_minor: 10000, value_minor: 25000,
      cost_basis_minor: 20000, observed_at: '2026-08-07T04:00:00Z',
    };
    await imports.promoteCanonicalAccounts(userId, [{
      account_reference: 'lunchflow:broker-1', account_type: 'brokerage', label: 'Broker',
      institution_name: 'Broker', currency: 'AUD', balance: 250, observed_at: '2026-08-07T04:00:00Z',
    }], {
      holdingsByAccount: { 'lunchflow:broker-1': [mappedHolding] },
      observedAt: mappedHolding.observed_at,
    });
    const accountValuation = (await admin.query(
      `SELECT amount_minor FROM valuations WHERE subject_type='financial_account' AND user_id=$1`, [userId]
    )).rows[0];
    assert.equal(Number(accountValuation.amount_minor), 0);
    const holdingResult = await imports.replaceHoldings(userId, [mappedHolding], {
      accountReferences: ['lunchflow:broker-1'], observedAt: mappedHolding.observed_at,
    });
    assert.equal(holdingResult.holdings, 1);
    assert.equal(Number((await admin.query(`SELECT COUNT(*) FROM holdings WHERE user_id=$1`, [userId])).rows[0].count), 1);
    const valuation = (await admin.query(
      `SELECT amount_minor,source FROM valuations WHERE user_id=$1 AND subject_type='holding'`, [userId]
    )).rows[0];
    assert.equal(Number(valuation.amount_minor), 25000);
    assert.equal(valuation.source, 'lunchflow');
    assert.equal(Number((await admin.query(`SELECT COUNT(*) FROM instruments WHERE user_id=$1`, [userId])).rows[0].count), 1);
    const removed = await imports.replaceHoldings(userId, [], {
      accountReferences: ['lunchflow:broker-1'], observedAt: '2026-08-08T04:00:00Z',
    });
    assert.equal(removed.stale_removed, 1);
    const zero = (await admin.query(
      `SELECT amount_minor FROM valuations WHERE subject_type='holding' ORDER BY as_of DESC LIMIT 1`
    )).rows[0];
    assert.equal(Number(zero.amount_minor), 0);
    const repeatedRemoval = await imports.replaceHoldings(userId, [], {
      accountReferences: ['lunchflow:broker-1'], observedAt: '2026-08-09T04:00:00Z',
    });
    assert.equal(repeatedRemoval.stale_removed, 0);
    console.log('✓ Lunch Flow tokens, transaction mirror, holdings, and valuations persist correctly');
  } finally {
    if (global.__maalPool) await global.__maalPool.end();
    await admin.end();
    delete global.__maalPool;
    delete process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
