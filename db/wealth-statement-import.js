'use strict';

const pool = require('./pool');
const { instrumentMatchKey } = require('../lib/wealth-statement-import');

async function persistStatementImport(userId, statementId, normalized, evidence) {
  if (!statementId || !/^[A-Za-z0-9._:-]{1,200}$/.test(statementId)) throw new Error('A stable statementId is required');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const importResult = await client.query(
      `INSERT INTO wealth_statement_imports
         (user_id, statement_id, source_hash, kind, account_name, as_of, raw_csv)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, statement_id, source_hash) DO NOTHING
       RETURNING id`,
      [userId, statementId, evidence.sourceHash, normalized.account.accountType,
       normalized.account.name, normalized.account.asOf, evidence.rawCsv]
    );
    const sourceImport = importResult.rows[0] || (await client.query(
      `SELECT id FROM wealth_statement_imports WHERE user_id=$1 AND statement_id=$2 AND source_hash=$3`,
      [userId, statementId, evidence.sourceHash]
    )).rows[0];
    const externalReference = `statement:${statementId}`;
    const accountResult = await client.query(
      `INSERT INTO financial_accounts
         (user_id, account_type, name, institution, external_reference, currency, source, confidence, as_of)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id, source, external_reference) WHERE external_reference IS NOT NULL
       DO UPDATE SET
         name=CASE WHEN financial_accounts.as_of IS NULL OR (EXCLUDED.as_of IS NOT NULL AND EXCLUDED.as_of >= financial_accounts.as_of) THEN EXCLUDED.name ELSE financial_accounts.name END,
         institution=CASE WHEN financial_accounts.as_of IS NULL OR (EXCLUDED.as_of IS NOT NULL AND EXCLUDED.as_of >= financial_accounts.as_of) THEN EXCLUDED.institution ELSE financial_accounts.institution END,
         currency=CASE WHEN financial_accounts.as_of IS NULL OR (EXCLUDED.as_of IS NOT NULL AND EXCLUDED.as_of >= financial_accounts.as_of) THEN EXCLUDED.currency ELSE financial_accounts.currency END,
         confidence=CASE WHEN financial_accounts.as_of IS NULL OR (EXCLUDED.as_of IS NOT NULL AND EXCLUDED.as_of >= financial_accounts.as_of) THEN EXCLUDED.confidence ELSE financial_accounts.confidence END,
         as_of=CASE WHEN financial_accounts.as_of IS NULL OR (EXCLUDED.as_of IS NOT NULL AND EXCLUDED.as_of >= financial_accounts.as_of) THEN EXCLUDED.as_of ELSE financial_accounts.as_of END,
         updated_at=NOW()
       RETURNING id`,
      [userId, normalized.account.accountType, normalized.account.name, normalized.account.institution,
       externalReference, normalized.account.currency, normalized.account.source,
       normalized.account.confidence, normalized.account.asOf]
    );
    const accountId = accountResult.rows[0].id;
    const existingHoldings = await client.query(
      `SELECT h.id, h.legacy_key, h.currency
         FROM holdings h WHERE h.user_id=$1 AND h.financial_account_id=$2 AND h.source='statement_import'`,
      [userId, accountId]
    );
    const retainedHoldingIds = new Set();
    let imported = 0;
    for (const row of normalized.holdings) {
      const matchKey = instrumentMatchKey(row.instrument);
      const instrumentResult = await client.query(
        `INSERT INTO instruments
           (user_id, name, instrument_type, ticker, isin, apir, exchange, currency, match_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (user_id, match_key) WHERE match_key IS NOT NULL DO UPDATE SET
           name=EXCLUDED.name, instrument_type=EXCLUDED.instrument_type,
           ticker=COALESCE(EXCLUDED.ticker,instruments.ticker), isin=COALESCE(EXCLUDED.isin,instruments.isin),
           apir=COALESCE(EXCLUDED.apir,instruments.apir), exchange=COALESCE(EXCLUDED.exchange,instruments.exchange),
           currency=EXCLUDED.currency, updated_at=NOW()
         RETURNING id`,
        [userId, row.instrument.name, row.instrument.instrumentType, row.instrument.ticker,
         row.instrument.isin, row.instrument.apir, row.instrument.exchange, row.instrument.currency, matchKey]
      );
      const holdingKey = `${externalReference}:holding:${matchKey}`;
      const holdingResult = await client.query(
        `INSERT INTO holdings
           (user_id, financial_account_id, instrument_id, units, cost_basis_minor, currency, as_of, source, confidence, legacy_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (user_id, legacy_key) DO UPDATE SET
           units=CASE WHEN holdings.as_of IS NULL OR (EXCLUDED.as_of IS NOT NULL AND EXCLUDED.as_of >= holdings.as_of) THEN EXCLUDED.units ELSE holdings.units END,
           cost_basis_minor=CASE WHEN holdings.as_of IS NULL OR (EXCLUDED.as_of IS NOT NULL AND EXCLUDED.as_of >= holdings.as_of) THEN EXCLUDED.cost_basis_minor ELSE holdings.cost_basis_minor END,
           currency=CASE WHEN holdings.as_of IS NULL OR (EXCLUDED.as_of IS NOT NULL AND EXCLUDED.as_of >= holdings.as_of) THEN EXCLUDED.currency ELSE holdings.currency END,
           confidence=CASE WHEN holdings.as_of IS NULL OR (EXCLUDED.as_of IS NOT NULL AND EXCLUDED.as_of >= holdings.as_of) THEN EXCLUDED.confidence ELSE holdings.confidence END,
           as_of=CASE WHEN holdings.as_of IS NULL OR (EXCLUDED.as_of IS NOT NULL AND EXCLUDED.as_of >= holdings.as_of) THEN EXCLUDED.as_of ELSE holdings.as_of END,
           updated_at=NOW()
         RETURNING id`,
        [userId, accountId, instrumentResult.rows[0].id, row.units, row.costBasisMinor,
         row.currency, row.asOf, row.source, row.confidence, holdingKey]
      );
      const subjectKey = `holding:${holdingResult.rows[0].id}`;
      retainedHoldingIds.add(String(holdingResult.rows[0].id));
      const valuationKey = `${holdingKey}:valuation:${evidence.sourceHash}`;
      await client.query(
        `INSERT INTO valuations
           (user_id, subject_type, subject_key, classification, amount_minor, currency, as_of,
            source, confidence, legacy_key, presentation_amount_minor, presentation_currency,
            fx_rate, fx_source, fx_as_of, metadata)
         VALUES ($1,'holding',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
         ON CONFLICT (user_id, legacy_key) DO NOTHING`,
        [userId, subjectKey, normalized.account.accountType === 'super' ? 'super' : 'investment',
         row.valueMinor, row.currency, row.asOf, row.source, row.confidence, valuationKey,
         row.presentationValueMinor, row.presentationCurrency, row.fxRate, row.fxSource, row.fxAsOf,
         JSON.stringify({ statement_import_id: sourceImport.id, statement_id: statementId, source_hash: evidence.sourceHash })]
      );
      await client.query(
        `INSERT INTO ownership_interests
           (user_id, subject_type, subject_key, owner_type, ownership_percent, effective_from, legacy_key)
         VALUES ($1,'holding',$2,'self',100,$3,$4)
         ON CONFLICT (user_id, legacy_key) DO NOTHING`,
        [userId, subjectKey, row.asOf, `${holdingKey}:ownership`]
      );
      imported++;
    }
    for (const holding of existingHoldings.rows) {
      if (retainedHoldingIds.has(String(holding.id))) continue;
      const sample = normalized.holdings[0];
      const foreign = holding.currency !== 'AUD';
      await client.query(
        `INSERT INTO valuations
           (user_id, subject_type, subject_key, classification, amount_minor, currency, as_of,
            source, confidence, legacy_key, presentation_amount_minor, presentation_currency,
            fx_rate, fx_source, fx_as_of, metadata)
         VALUES ($1,'holding',$2,$3,0,$4,$5,'statement_import',0.900,$6,$7,$8,$9,$10,$11,$12::jsonb)
         ON CONFLICT (user_id, legacy_key) DO NOTHING`,
        [userId, `holding:${holding.id}`, normalized.account.accountType === 'super' ? 'super' : 'investment',
         holding.currency, normalized.account.asOf, `${holding.legacy_key}:removed:${evidence.sourceHash}`,
         foreign ? 0 : null, foreign ? 'AUD' : null, foreign ? sample?.fxRate : null,
         foreign ? sample?.fxSource : null, foreign ? normalized.account.asOf : null,
         JSON.stringify({ statement_import_id: sourceImport.id, statement_id: statementId, removed: true })]
      );
    }
    await client.query('COMMIT');
    return { accountId, holdings: imported };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { persistStatementImport };
