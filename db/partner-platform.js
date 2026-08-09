'use strict';

const pool = require('./pool');
const { visibleOfferings, createConsent } = require('../lib/partner-platform');

async function marketplace() {
  const governance=(await pool.query('SELECT marketplace_approved,commercial_terms_version FROM marketplace_governance WHERE singleton=TRUE')).rows[0] || {marketplace_approved:false};
  const partners=(await pool.query(`SELECT partner_key AS "partnerKey",name,status,enabled,sponsored,display_rank AS rank,scopes,fields,manifest,health_status AS "healthStatus" FROM partner_registry`)).rows;
  return { enabled: governance.marketplace_approved, reason: governance.marketplace_approved ? null : 'governance_approval_required', commercialTermsVersion: governance.commercial_terms_version, offerings: visibleOfferings(partners,{marketplaceApproved:governance.marketplace_approved}) };
}
async function grantConsent(userId,partnerKey,request) {
  const client=await pool.connect(); try { await client.query('BEGIN');
    const governance=(await client.query('SELECT marketplace_approved FROM marketplace_governance WHERE singleton=TRUE FOR SHARE')).rows[0];
    if(!governance?.marketplace_approved){const e=new Error('Partner marketplace governance approval is required');e.statusCode=403;throw e;}
    const partner=(await client.query(`SELECT id,partner_key AS "partnerKey",name,status,enabled,scopes,fields FROM partner_registry WHERE partner_key=$1 AND status='approved' AND enabled=TRUE`,[partnerKey])).rows[0];
    if(!partner){const e=new Error('Approved partner not found');e.statusCode=404;throw e;}
    const consent=createConsent(partner,request);
    const row=(await client.query(`INSERT INTO partner_consents(user_id,partner_id,scopes,fields,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING *`,[userId,partner.id,consent.scopes,consent.fields,consent.expiresAt])).rows[0];
    await client.query(`INSERT INTO partner_audit_events(user_id,partner_id,consent_id,action,metadata) VALUES($1,$2,$3,'consent_granted',$4)`,[userId,partner.id,row.id,{scopes:consent.scopes,fields:consent.fields,expiresAt:consent.expiresAt}]);
    await client.query('COMMIT'); return row;
  } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
}
async function revokeConsent(userId,id) {
  const client=await pool.connect(); try {await client.query('BEGIN');
    const row=(await client.query(`UPDATE partner_consents SET status='revoked',revoked_at=NOW() WHERE id=$1 AND user_id=$2 AND status='active' RETURNING *`,[id,userId])).rows[0];
    if(!row){const e=new Error('Active consent not found');e.statusCode=404;throw e;}
    await client.query(`INSERT INTO partner_audit_events(user_id,partner_id,consent_id,action) VALUES($1,$2,$3,'consent_revoked')`,[userId,row.partner_id,row.id]);
    await client.query('COMMIT');return row;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
async function listConsents(userId){return (await pool.query(`SELECT c.*,p.partner_key,p.name FROM partner_consents c JOIN partner_registry p ON p.id=c.partner_id WHERE c.user_id=$1 ORDER BY c.created_at DESC`,[userId])).rows;}
async function upsertPartner(adminUserId,manifest){
  const {validateManifest}=require('../lib/partner-platform');const valid=validateManifest(manifest);
  const row=(await pool.query(`INSERT INTO partner_registry(partner_key,name,status,enabled,sponsored,display_rank,scopes,fields,manifest)
    VALUES($1,$2,'review',FALSE,$3,$4,$5,$6,$7) ON CONFLICT(partner_key) DO UPDATE SET name=EXCLUDED.name,scopes=EXCLUDED.scopes,fields=EXCLUDED.fields,manifest=EXCLUDED.manifest,status='review',enabled=FALSE,updated_at=NOW() RETURNING *`,[valid.partnerKey,valid.name,valid.sponsored===true,Number(valid.rank||1000),valid.scopes,valid.fields,valid])).rows[0];
  await pool.query(`INSERT INTO partner_audit_events(user_id,partner_id,action,metadata) VALUES($1,$2,'manifest_submitted',$3)`,[adminUserId,row.id,valid]);return row;
}
async function setPartnerApproval(adminUserId,partnerKey,approved,enabled){
  const client=await pool.connect();try{await client.query('BEGIN');const row=(await client.query(`UPDATE partner_registry SET status=$1,enabled=$2,approved_by=$3,approved_at=CASE WHEN $1='approved' THEN NOW() ELSE NULL END,health_status=CASE WHEN $2 THEN 'healthy' ELSE 'disabled' END,updated_at=NOW() WHERE partner_key=$4 AND ($1<>'approved' OR sandbox_status='certified') RETURNING *`,[approved?'approved':'rejected',approved&&enabled,adminUserId,partnerKey])).rows[0];
  if(!row){const e=new Error('Partner not found');e.statusCode=404;throw e;}await client.query(`INSERT INTO partner_audit_events(user_id,partner_id,action,metadata) VALUES($1,$2,$3,$4)`,[adminUserId,row.id,approved?'partner_approved':'partner_rejected',{enabled:row.enabled}]);await client.query('COMMIT');return row;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
async function setGovernance(adminUserId,approved,termsVersion){const client=await pool.connect();try{await client.query('BEGIN');await client.query(`UPDATE marketplace_governance SET marketplace_approved=$1,approved_by=$2,approved_at=CASE WHEN $1 THEN NOW() ELSE NULL END,commercial_terms_version=$3,updated_at=NOW() WHERE singleton=TRUE`,[approved,String(adminUserId),approved?termsVersion:null]);await client.query(`INSERT INTO partner_audit_events(user_id,action,metadata) VALUES($1,'marketplace_governance_changed',$2)`,[adminUserId,{approved,termsVersion:approved?termsVersion:null}]);await client.query('COMMIT');return marketplace();}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
async function certifySandbox(adminUserId,partnerKey,certified,evidence){const row=(await pool.query(`UPDATE partner_registry SET sandbox_status=$1,updated_at=NOW() WHERE partner_key=$2 RETURNING *`,[certified?'certified':'failed',partnerKey])).rows[0];if(!row){const e=new Error('Partner not found');e.statusCode=404;throw e;}await pool.query(`INSERT INTO partner_audit_events(user_id,partner_id,action,metadata) VALUES($1,$2,'sandbox_certification',$3)`,[adminUserId,row.id,{certified,evidence}]);return row;}
async function recordUsage(userId,partnerId,consentId,eventType,units=1,metadata={}){return (await pool.query(`INSERT INTO partner_usage_events(user_id,partner_id,consent_id,event_type,units,metadata) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[userId,partnerId,consentId,eventType,units,metadata])).rows[0];}
module.exports={marketplace,grantConsent,revokeConsent,listConsents,upsertPartner,setPartnerApproval,setGovernance,certifySandbox,recordUsage};
