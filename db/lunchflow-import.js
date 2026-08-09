'use strict';

const pool = require('./pool');

async function replaceAccounts(userId, accounts) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM linked_accounts WHERE user_id = $1 AND account_reference LIKE 'lunchflow:%'`,
      [userId]
    );
    for (const account of accounts) {
      await client.query(
        `INSERT INTO linked_accounts
           (user_id, institution_name, institution_type, account_reference, balance, connection_status)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          userId, account.institution_name, account.institution_type,
          account.account_reference, account.balance,
          account.status === 'active' ? 'active' : 'disconnected',
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function upsertTransactions(userId, transactions, options = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM transactions
        WHERE user_id = $1 AND status = 'pending' AND basiq_id LIKE 'lunchflow:%'`,
      [userId]
    );
    let saved = 0;
    for (const transaction of transactions) {
      const { rows } = await client.query(
        `INSERT INTO transactions (user_id, basiq_id, description, amount, status, post_date)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id, basiq_id) WHERE basiq_id IS NOT NULL DO UPDATE
           SET description = EXCLUDED.description, amount = EXCLUDED.amount,
               status = EXCLUDED.status, post_date = EXCLUDED.post_date
         RETURNING id`,
        [
          userId, transaction.provider_id, transaction.description,
          transaction.amount, transaction.status, transaction.post_date,
        ]
      );
      await client.query(
        `INSERT INTO transaction_provider_details
           (transaction_id, user_id, account_reference, observed_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (transaction_id) DO UPDATE
           SET account_reference = EXCLUDED.account_reference, observed_at = NOW()`,
        [rows[0].id, userId, transaction.account_reference]
      );
      saved++;
    }
    let staleRemoved = 0;
    const accountReferences = (options.accountReferences || []).filter(Boolean);
    const windowStart = options.windowStart || null;
    if (windowStart && accountReferences.length) {
      const incomingIds = transactions.map((row) => row.provider_id).filter(Boolean);
      const removed = await client.query(
        `DELETE FROM transactions t
          USING transaction_provider_details pd
         WHERE pd.transaction_id = t.id AND pd.user_id = $1 AND t.user_id = $1
           AND t.basiq_id LIKE 'lunchflow:%'
           AND t.status = 'posted' AND t.post_date >= $2::date
           AND pd.account_reference = ANY($3::text[])
           AND NOT (t.basiq_id = ANY($4::text[]))`,
        [userId, windowStart, accountReferences, incomingIds]
      );
      staleRemoved = removed.rowCount;
    }
    await client.query('COMMIT');
    return { saved, stale_removed: staleRemoved };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function replaceHoldings(userId, holdings, options = {}) {
  const client = await pool.connect();
  let imported = 0;
  let skipped = 0;
  let staleRemoved = 0;
  try {
    await client.query('BEGIN');
    const byAccount = new Map();
    for (const accountReference of options.accountReferences || []) {
      if (accountReference) byAccount.set(accountReference, []);
    }
    for (const holding of holdings) {
      const rows = byAccount.get(holding.account_reference) || [];
      rows.push(holding);
      byAccount.set(holding.account_reference, rows);
    }
    for (const [accountReference, accountHoldings] of byAccount) {
      const externalId = String(accountReference || '').replace(/^lunchflow:/, '');
      const { rows: links } = await client.query(
        `SELECT l.financial_account_id, a.account_type
           FROM canonical_account_links l
           JOIN financial_accounts a ON a.id=l.financial_account_id AND a.user_id=l.user_id
          WHERE l.user_id=$1 AND l.provider='lunchflow' AND l.external_account_id=$2 AND l.status='active'`,
        [userId, externalId]
      );
      const financialAccountId = links[0]?.financial_account_id;
      const classification = links[0]?.account_type === 'super' ? 'super' : 'investment';
      if (!financialAccountId) {
        skipped += accountHoldings.length;
        continue;
      }
      const keepLegacyKeys = [];
      for (const holding of accountHoldings) {
        const instrumentLegacyKey = `lunchflow:instrument:${holding.holding_key}`;
        const holdingLegacyKey = `lunchflow:${externalId}:holding:${holding.holding_key}`;
        keepLegacyKeys.push(holdingLegacyKey);
        const { rows: existingInstruments } = await client.query(
          `SELECT id FROM instruments
            WHERE user_id=$1 AND (($2::text IS NOT NULL AND isin=$2) OR match_key=$3)
            ORDER BY CASE WHEN isin=$2 THEN 0 ELSE 1 END, id LIMIT 1`,
          [userId, holding.isin, holding.holding_key]
        );
        let instrumentId = existingInstruments[0]?.id;
        if (instrumentId) {
          await client.query(
            `UPDATE instruments SET name=$3, ticker=COALESCE($4,ticker),
               isin=COALESCE($5,isin), exchange=COALESCE($6,exchange), currency=$7,
               match_key=COALESCE(match_key,$8), metadata=metadata || $9::jsonb, updated_at=NOW()
             WHERE id=$1 AND user_id=$2`,
            [instrumentId, userId, holding.name, holding.ticker, holding.isin, holding.exchange,
             holding.currency, holding.holding_key, JSON.stringify({ figi: holding.figi })]
          );
        } else {
          const { rows: instruments } = await client.query(
            `INSERT INTO instruments
               (user_id, name, instrument_type, ticker, isin, exchange, currency, legacy_key, match_key, metadata)
             VALUES ($1,$2,'listed_security',$3,$4,$5,$6,$7,$8,$9::jsonb)
             ON CONFLICT (user_id, match_key) WHERE match_key IS NOT NULL DO UPDATE SET
               name=EXCLUDED.name, ticker=COALESCE(EXCLUDED.ticker,instruments.ticker),
               isin=COALESCE(EXCLUDED.isin,instruments.isin), exchange=COALESCE(EXCLUDED.exchange,instruments.exchange),
               currency=EXCLUDED.currency, metadata=instruments.metadata || EXCLUDED.metadata, updated_at=NOW()
             RETURNING id`,
            [userId, holding.name, holding.ticker, holding.isin, holding.exchange, holding.currency,
             instrumentLegacyKey, holding.holding_key, JSON.stringify({ figi: holding.figi })]
          );
          instrumentId = instruments[0].id;
        }
        const { rows: savedHoldings } = await client.query(
          `INSERT INTO holdings
             (user_id, financial_account_id, instrument_id, units, cost_basis_minor,
              currency, as_of, source, confidence, legacy_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'lunchflow',0.950,$8)
           ON CONFLICT (user_id, legacy_key) DO UPDATE SET
             financial_account_id=EXCLUDED.financial_account_id,
             instrument_id=EXCLUDED.instrument_id, units=EXCLUDED.units,
             cost_basis_minor=EXCLUDED.cost_basis_minor, currency=EXCLUDED.currency,
             as_of=EXCLUDED.as_of, confidence=EXCLUDED.confidence, updated_at=NOW()
           RETURNING id`,
          [userId, financialAccountId, instrumentId, holding.units,
           holding.cost_basis_minor, holding.currency, holding.observed_at, holdingLegacyKey]
        );
        const holdingId = savedHoldings[0].id;
        const valuationKey = `${holdingLegacyKey}:valuation:${holding.observed_at}`;
        await client.query(
          `INSERT INTO valuations
             (user_id, subject_type, subject_key, classification, amount_minor,
              currency, as_of, source, confidence, legacy_key, metadata)
           VALUES ($1,'holding',$2,$3,$4,$5,$6,'lunchflow',0.950,$7,$8::jsonb)
           ON CONFLICT (user_id, legacy_key) DO NOTHING`,
          [userId, `holding:${holdingId}`, classification, holding.value_minor, holding.currency,
           holding.observed_at, valuationKey,
           JSON.stringify({ price_minor: holding.price_minor, figi: holding.figi })]
        );
        await client.query(
          `INSERT INTO ownership_interests
             (user_id, subject_type, subject_key, owner_type, ownership_percent,
              effective_from, legacy_key)
           VALUES ($1,'holding',$2,'self',100,$3,$4)
           ON CONFLICT (user_id, legacy_key) DO UPDATE SET
             effective_to=NULL, updated_at=NOW()`,
          [userId, `holding:${holdingId}`, holding.observed_at, `${holdingLegacyKey}:ownership`]
        );
        imported++;
      }
      const { rows: staleHoldings } = await client.query(
        `SELECT id, legacy_key, currency FROM holdings
          WHERE user_id=$1 AND financial_account_id=$2 AND source='lunchflow'
            AND units <> 0
            AND NOT (legacy_key = ANY($3::text[]))`,
        [userId, financialAccountId, keepLegacyKeys]
      );
      const removedAt = options.observedAt || new Date().toISOString();
      for (const stale of staleHoldings) {
        await client.query(
          `UPDATE holdings SET units=0, cost_basis_minor=0, as_of=$3, updated_at=NOW()
            WHERE id=$1 AND user_id=$2`,
          [stale.id, userId, removedAt]
        );
        await client.query(
          `INSERT INTO valuations
             (user_id, subject_type, subject_key, classification, amount_minor,
              currency, as_of, source, confidence, legacy_key, metadata)
           VALUES ($1,'holding',$2,$3,0,$4,$5,'lunchflow',0.950,$6,$7::jsonb)
           ON CONFLICT (user_id, legacy_key) DO NOTHING`,
          [userId, `holding:${stale.id}`, classification, stale.currency, removedAt,
           `${stale.legacy_key}:removed:${removedAt}`, JSON.stringify({ removed: true })]
        );
        await client.query(
          `UPDATE ownership_interests SET effective_to=$3, updated_at=NOW()
            WHERE user_id=$1 AND subject_type='holding' AND subject_key=$2 AND effective_to IS NULL`,
          [userId, `holding:${stale.id}`, removedAt]
        );
      }
      staleRemoved += staleHoldings.length;
    }
    await client.query('COMMIT');
    return { holdings: imported, skipped, stale_removed: staleRemoved };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function promoteCanonicalAccounts(userId, accounts, options = {}) {
  const client = await pool.connect();
  const result = { promoted: 0, needs_review: 0, unclassified: 0 };
  try {
    await client.query('BEGIN');
    for (const account of accounts) {
      if (!account.account_type) { result.unclassified++; continue; }
      const externalId = account.account_reference.replace(/^lunchflow:/, '');
      const linked = await client.query(
        `SELECT financial_account_id, status FROM canonical_account_links
          WHERE user_id=$1 AND provider='lunchflow' AND external_account_id=$2`,
        [userId, externalId]
      );
      let accountId = linked.rows[0]?.financial_account_id;
      let linkStatus = linked.rows[0]?.status;
      if (!accountId) {
        const possibleDuplicate = await client.query(
          `SELECT id FROM financial_accounts
            WHERE user_id=$1 AND account_type=$2 AND currency=$3
              AND LOWER(COALESCE(institution,''))=LOWER($4)
              AND LOWER(name)=LOWER($5)
            ORDER BY id LIMIT 1`,
          [userId, account.account_type, account.currency, account.institution_name, account.label]
        );
        if (possibleDuplicate.rows[0]) {
          accountId = possibleDuplicate.rows[0].id;
          linkStatus = 'needs_review';
          result.needs_review++;
        } else {
          const inserted = await client.query(
            `INSERT INTO financial_accounts
               (user_id, account_type, name, institution, external_reference, currency, source, confidence, as_of)
             VALUES ($1,$2,$3,$4,$5,$6,'lunchflow',0.950,$7) RETURNING id`,
            [userId, account.account_type, account.label, account.institution_name,
             account.account_reference, account.currency, account.observed_at]
          );
          accountId = inserted.rows[0].id;
          linkStatus = account.currency === 'AUD' ? 'active' : 'needs_review';
          if (linkStatus === 'needs_review') result.needs_review++;
        }
        await client.query(
          `INSERT INTO canonical_account_links
             (user_id, provider, external_account_id, financial_account_id, match_method, confidence, status, last_seen_at)
           VALUES ($1,'lunchflow',$2,$3,$4,$5,$6,$7)
           ON CONFLICT (user_id, provider, external_account_id) DO UPDATE SET
             financial_account_id=EXCLUDED.financial_account_id, status=EXCLUDED.status,
             confidence=EXCLUDED.confidence, last_seen_at=EXCLUDED.last_seen_at, updated_at=NOW()`,
          [userId, externalId, accountId, linkStatus === 'active' ? 'provider_reference' : 'exact_metadata',
           linkStatus === 'active' ? 0.95 : 0.8, linkStatus, account.observed_at]
        );
      } else {
        await client.query(
          `UPDATE canonical_account_links SET last_seen_at=$4, updated_at=NOW()
            WHERE user_id=$1 AND provider=$2 AND external_account_id=$3`,
          [userId, 'lunchflow', externalId, account.observed_at]
        );
      }
      if (account.currency !== 'AUD' && linkStatus === 'active') {
        linkStatus = 'needs_review';
        result.needs_review++;
        await client.query(
          `UPDATE canonical_account_links SET status='needs_review', updated_at=NOW()
            WHERE user_id=$1 AND provider='lunchflow' AND external_account_id=$2`,
          [userId, externalId]
        );
      }
      if (linkStatus !== 'active') continue;
      const classification = { cash: 'cash', brokerage: 'investment', super: 'super', liability: 'debt' }[account.account_type];
      const holdingsUnsupported = (options.unsupportedHoldingAccounts || []).includes(account.account_reference);
      if (holdingsUnsupported && ['brokerage', 'super'].includes(account.account_type)) {
        const { rows: priorHoldings } = await client.query(
          `SELECT 1 FROM holdings
            WHERE user_id=$1 AND financial_account_id=$2 AND source='lunchflow' AND units <> 0
            LIMIT 1`,
          [userId, accountId]
        );
        if (priorHoldings.length) {
          result.promoted++;
          continue;
        }
      }
      const accountHoldings = options.holdingsByAccount?.[account.account_reference];
      const holdingsMinor = Array.isArray(accountHoldings)
        ? accountHoldings.reduce((sum, holding) => sum + Math.max(0, Number(holding.value_minor) || 0), 0)
        : 0;
      const balanceMinor = Math.round(Math.abs(Number(account.balance)) * 100);
      const amountMinor = Array.isArray(accountHoldings) && accountHoldings.length
        ? Math.max(0, balanceMinor - holdingsMinor)
        : balanceMinor;
      const valuationObservedAt = options.observedAt || account.observed_at;
      await client.query(
        `INSERT INTO valuations
           (user_id, subject_type, subject_key, classification, amount_minor, currency, as_of, source, confidence, legacy_key)
         VALUES ($1,'financial_account',$2,$3,$4,$5,$6,'lunchflow',0.950,$7)
         ON CONFLICT (user_id, legacy_key) DO NOTHING`,
        [userId, `financial_account:${accountId}`, classification, amountMinor,
         account.currency, valuationObservedAt, `lunchflow:${externalId}:balance:${valuationObservedAt}`]
      );
      await client.query(
        `INSERT INTO ownership_interests
           (user_id, subject_type, subject_key, owner_type, ownership_percent, effective_from, legacy_key)
         VALUES ($1,'financial_account',$2,'self',100,$3,$4)
         ON CONFLICT (user_id, legacy_key) DO NOTHING`,
        [userId, `financial_account:${accountId}`, account.observed_at, `lunchflow:${externalId}:ownership`]
      );
      result.promoted++;
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { replaceAccounts, upsertTransactions, replaceHoldings, promoteCanonicalAccounts };
