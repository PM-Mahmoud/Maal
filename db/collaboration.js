'use strict';

const pool = require('./pool');
const {
  normalizeEmail,
  normalizeHouseholdName,
  normalizeOwnership,
  normalizeGrant,
  READ_SCOPES,
} = require('../lib/collaboration');

async function createHousehold(userId, name) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const household = (await client.query(
      'INSERT INTO households(name,created_by) VALUES($1,$2) RETURNING *',
      [normalizeHouseholdName(name), userId]
    )).rows[0];
    await client.query(
      "INSERT INTO household_members(household_id,user_id,role,ownership) VALUES($1,$2,'owner',100)",
      [household.id, userId]
    );
    await client.query('COMMIT');
    return household;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listHouseholds(userId) {
  return (await pool.query(
    `SELECT h.*, hm.role, hm.ownership
       FROM households h
       JOIN household_members hm ON hm.household_id = h.id
      WHERE hm.user_id = $1
      ORDER BY h.created_at`,
    [userId]
  )).rows;
}

async function getHousehold(householdId, userId) {
  const household = (await pool.query(
    `SELECT h.*, hm.role, hm.ownership
       FROM households h
       JOIN household_members hm ON hm.household_id = h.id
      WHERE h.id = $1 AND hm.user_id = $2`,
    [householdId, userId]
  )).rows[0];
  if (!household) return null;

  const members = (await pool.query(
    `SELECT hm.household_id, hm.user_id, u.email, u.name, hm.role, hm.ownership, hm.joined_at
       FROM household_members hm
       JOIN users u ON u.id = hm.user_id
      WHERE hm.household_id = $1
      ORDER BY CASE WHEN hm.role = 'owner' THEN 0 ELSE 1 END, hm.joined_at, hm.user_id`,
    [householdId]
  )).rows;
  return { ...household, members };
}

async function addMember(householdId, actorId, userId, ownership = 100) {
  const share = normalizeOwnership(ownership);
  if (String(actorId) === String(userId)) return null;
  return (await pool.query(
    `INSERT INTO household_members(household_id,user_id,role,ownership)
     SELECT $1, $3, 'member', $4
       FROM households h
      WHERE h.id = $1
        AND EXISTS (
          SELECT 1 FROM household_members owner
           WHERE owner.household_id = $1 AND owner.user_id = $2 AND owner.role = 'owner'
        )
     ON CONFLICT (household_id,user_id)
     DO UPDATE SET ownership = CASE
       WHEN household_members.role = 'owner' THEN household_members.ownership
       ELSE EXCLUDED.ownership
     END
     RETURNING *`,
    [householdId, actorId, userId, share]
  )).rows[0] || null;
}

async function updateMemberOwnership(householdId, actorId, userId, ownership) {
  const share = normalizeOwnership(ownership);
  return (await pool.query(
    `UPDATE household_members member
        SET ownership = CASE WHEN member.role = 'owner' THEN member.ownership ELSE $4 END
       FROM household_members owner
      WHERE member.household_id = $1
        AND member.user_id = $3
        AND owner.household_id = $1
        AND owner.user_id = $2
        AND owner.role = 'owner'
        AND member.role = 'member'
      RETURNING member.*`,
    [householdId, actorId, userId, share]
  )).rows[0] || null;
}

async function removeMember(householdId, actorId, userId) {
  return (await pool.query(
    `DELETE FROM household_members member
      USING household_members owner
      WHERE member.household_id = $1
        AND member.user_id = $3
        AND member.role = 'member'
        AND owner.household_id = $1
        AND owner.user_id = $2
        AND owner.role = 'owner'
      RETURNING member.*`,
    [householdId, actorId, userId]
  )).rows[0] || null;
}

async function createGrant(ownerUserId, input) {
  const grant = normalizeGrant(input);
  const owner = (await pool.query('SELECT email FROM users WHERE id = $1', [ownerUserId])).rows[0];
  if (owner && normalizeEmail(owner.email) === grant.email) return null;

  return (await pool.query(
    `INSERT INTO access_grants
       (owner_user_id,grantee_email,grantee_user_id,role,scopes,expires_at)
     VALUES ($1,$2,(SELECT id FROM users WHERE LOWER(email) = $2),$3,$4,$5)
     RETURNING id,owner_user_id,grantee_email,grantee_user_id,role,scopes,status,expires_at,created_at,revoked_at`,
    [ownerUserId, grant.email, grant.role, grant.scopes, grant.expiresAt]
  )).rows[0];
}

async function listGrants(ownerUserId) {
  return (await pool.query(
    `SELECT g.id,g.owner_user_id,g.grantee_email,g.grantee_user_id,g.role,g.scopes,
            g.status,g.expires_at,g.created_at,g.revoked_at,
            u.name AS grantee_name
       FROM access_grants g
       LEFT JOIN users u ON u.id = g.grantee_user_id
      WHERE g.owner_user_id = $1
      ORDER BY g.created_at DESC`,
    [ownerUserId]
  )).rows;
}

async function listIncomingGrants(granteeUserId) {
  return (await pool.query(
    `SELECT g.id,g.owner_user_id,g.grantee_email,g.role,g.scopes,g.status,
            g.expires_at,g.created_at,g.revoked_at,
            u.name AS owner_name, u.email AS owner_email
       FROM access_grants g
       JOIN users u ON u.id = g.owner_user_id
      WHERE g.grantee_user_id = $1
         OR (g.grantee_user_id IS NULL AND LOWER(g.grantee_email) =
             (SELECT LOWER(email) FROM users WHERE id = $1))
      ORDER BY g.created_at DESC`,
    [granteeUserId]
  )).rows;
}

async function acceptGrant(grantId, granteeUserId) {
  return (await pool.query(
    `UPDATE access_grants
        SET grantee_user_id = $2, status = 'active'
      WHERE id = $1
        AND status = 'pending'
        AND (grantee_user_id = $2 OR LOWER(grantee_email) =
             (SELECT LOWER(email) FROM users WHERE id = $2))
        AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING id,owner_user_id,grantee_email,grantee_user_id,role,scopes,status,expires_at,created_at,revoked_at`,
    [grantId, granteeUserId]
  )).rows[0] || null;
}

async function revokeGrant(ownerUserId, grantId) {
  return (await pool.query(
    `UPDATE access_grants
        SET status = 'revoked', revoked_at = NOW()
      WHERE id = $1 AND owner_user_id = $2 AND status <> 'revoked'
      RETURNING id,owner_user_id,grantee_email,grantee_user_id,role,scopes,status,expires_at,created_at,revoked_at`,
    [grantId, ownerUserId]
  )).rows[0] || null;
}

async function getReadAccess(requesterUserId, ownerUserId, scope) {
  if (!READ_SCOPES.includes(scope)) throw new Error('Unknown collaboration scope.');
  if (String(requesterUserId) === String(ownerUserId)) {
    return { owner_user_id: ownerUserId, grantee_user_id: requesterUserId, owner: true, scopes: [...READ_SCOPES] };
  }
  return (await pool.query(
    `SELECT id,owner_user_id,grantee_user_id,role,scopes,expires_at
       FROM access_grants
      WHERE owner_user_id = $2
        AND grantee_user_id = $1
        AND status = 'active'
        AND $3 = ANY(scopes)
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 1`,
    [requesterUserId, ownerUserId, scope]
  )).rows[0] || null;
}

async function linkDocument(userId, input) {
  const taxYear = input.taxYear === undefined || input.taxYear === null || input.taxYear === ''
    ? null : Number(input.taxYear);
  if (taxYear !== null && (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2200)) {
    throw new Error('Tax year must be a four-digit year.');
  }
  const documentType = String(input.documentType || '').trim().slice(0, 80);
  if (!documentType) throw new Error('Document type is required.');
  return (await pool.query(
    `INSERT INTO supporting_documents
       (user_id,vault_file_id,tax_year,document_type,entity_type,entity_id)
     SELECT $1,$2,$3,$4,$5,$6
       FROM vault_files
      WHERE vault_files.id = $2 AND vault_files.user_id = $1 AND vault_files.kind = 'vault'
     RETURNING *`,
    [userId, input.vaultFileId, taxYear, documentType,
      input.entityType ? String(input.entityType).slice(0, 80) : null,
      input.entityId || null]
  )).rows[0] || null;
}

async function listDocuments(userId, taxYear) {
  const year = taxYear === undefined || taxYear === null || taxYear === '' ? null : Number(taxYear);
  if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2200)) {
    throw new Error('Tax year must be a four-digit year.');
  }
  return (await pool.query(
    `SELECT d.id,d.user_id,d.vault_file_id,d.tax_year,d.document_type,d.entity_type,d.entity_id,d.created_at,
            v.filename,v.mime,v.size_bytes
       FROM supporting_documents d
       JOIN vault_files v ON v.id = d.vault_file_id AND v.user_id = d.user_id
      WHERE d.user_id = $1 AND ($2::int IS NULL OR d.tax_year = $2)
      ORDER BY d.created_at DESC`,
    [userId, year]
  )).rows;
}

async function unlinkDocument(userId, documentId) {
  return (await pool.query(
    'DELETE FROM supporting_documents WHERE id = $1 AND user_id = $2 RETURNING id',
    [documentId, userId]
  )).rows[0] || null;
}

async function getSharedDocument(ownerUserId, documentId) {
  return (await pool.query(
    `SELECT d.id,d.tax_year,d.document_type,d.entity_type,d.entity_id,d.created_at,
            v.filename,v.mime,v.content
       FROM supporting_documents d
       JOIN vault_files v ON v.id = d.vault_file_id AND v.user_id = d.user_id
      WHERE d.id = $1 AND d.user_id = $2`,
    [documentId, ownerUserId]
  )).rows[0] || null;
}

async function listSharedTransactions(ownerUserId, limit = 5000) {
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 5000);
  return (await pool.query(
    `SELECT id,basiq_id,description,amount,status,post_date,created_at
       FROM transactions
      WHERE user_id = $1
      ORDER BY post_date DESC NULLS LAST, id DESC
      LIMIT $2`,
    [ownerUserId, safeLimit]
  )).rows;
}

module.exports = {
  createHousehold,
  listHouseholds,
  getHousehold,
  addMember,
  updateMemberOwnership,
  removeMember,
  createGrant,
  listGrants,
  listIncomingGrants,
  acceptGrant,
  revokeGrant,
  getReadAccess,
  linkDocument,
  listDocuments,
  unlinkDocument,
  getSharedDocument,
  listSharedTransactions,
};
