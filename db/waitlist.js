/**
 * DB module — owns: waitlist_emails table queries
 * Does NOT own: user auth tables, route logic, email sending
 */
// Shared pool singleton (db/pool.js)
const pool = require('./pool');

/**
 * Add an email to the waitlist (or refresh an existing entry's consent/name).
 * Returns true if newly inserted, false if the email was already on the list.
 * An existing entry keeps its original source and status; consent is only
 * ever upgraded (false → true), never silently withdrawn by a re-signup.
 */
async function saveWaitlistEmail(email, opts = {}) {
  const { name = null, consent = false, source = 'website', score = null } = opts;
  const result = await pool.query(
    `INSERT INTO waitlist_emails (email, name, consent_contact, consent_at, source, score)
     VALUES ($1, $2, $3, CASE WHEN $3 THEN NOW() END, $4, $5)
     ON CONFLICT (LOWER(email)) DO UPDATE SET
       name            = COALESCE(waitlist_emails.name, EXCLUDED.name),
       consent_contact = waitlist_emails.consent_contact OR EXCLUDED.consent_contact,
       consent_at      = COALESCE(waitlist_emails.consent_at, EXCLUDED.consent_at),
       score           = COALESCE(EXCLUDED.score, waitlist_emails.score)
     RETURNING (xmax = 0) AS inserted`,
    [email, name, !!consent, source, score]
  );
  return !!(result.rows[0] && result.rows[0].inserted);
}

/** Waitlist rows whose email domain is one of `domains` (lowercase). */
async function listByDomains(domains) {
  if (!domains.length) return [];
  const { rows } = await pool.query(
    `SELECT id, email, name, status, source, consent_contact, invited_at, joined_at
       FROM waitlist_emails WHERE split_part(LOWER(email), '@', 2) = ANY($1::text[])`,
    [domains]
  );
  return rows;
}

async function listWaitlist({ status = null, source = null } = {}) {
  const { rows } = await pool.query(
    `SELECT id, email, name, status, source, consent_contact, score, created_at, invited_at, joined_at
       FROM waitlist_emails
      WHERE ($1::text IS NULL OR status = $1)
        AND ($2::text IS NULL OR source = $2)
      ORDER BY created_at ASC`,
    [status, source]
  );
  return rows;
}

async function waitlistCounts() {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM waitlist_emails GROUP BY status`
  );
  const out = { pending: 0, invited: 0, joined: 0 };
  rows.forEach((r) => { out[r.status] = r.n; });
  return out;
}

/** Mark pending entries invited. Returns the rows that changed (for emailing). */
async function markInvited(ids) {
  if (!ids.length) return [];
  const { rows } = await pool.query(
    `UPDATE waitlist_emails SET status = 'invited', invited_at = NOW()
      WHERE id = ANY($1::int[]) AND status = 'pending'
      RETURNING id, email, name`,
    [ids]
  );
  return rows;
}

async function markJoinedById(id) {
  await pool.query(
    `UPDATE waitlist_emails SET status = 'joined', joined_at = COALESCE(joined_at, NOW())
      WHERE id = $1`,
    [id]
  );
}

module.exports = { saveWaitlistEmail, listByDomains, listWaitlist, waitlistCounts, markInvited, markJoinedById };
