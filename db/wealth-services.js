'use strict';

const pool = require('./pool');

async function createRun(userId, data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO service_runs(user_id,service_type,methodology_key,methodology_version,methodology_review_status,input_snapshot,snapshot_hash,result,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [userId,data.serviceType,data.methodologyKey,data.methodologyVersion,data.methodologyReviewStatus,data.snapshot,data.snapshotHash,data.result,data.status]
    );
    const run = rows[0];
    for (const line of data.lines || []) await client.query(
      `INSERT INTO service_run_lines(run_id,user_id,line_key,line_type,evidence) VALUES($1,$2,$3,$4,$5)`,
      [run.id,userId,line.key,line.type || data.serviceType,line]
    );
    for (const obligation of data.obligations || []) {
      const inserted = await client.query(
        `INSERT INTO purification_obligations(user_id,run_id,obligation_key,security_key,amount_due_minor)
         VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,obligation_key) DO NOTHING RETURNING id`,
        [userId,run.id,obligation.key,obligation.securityKey,obligation.amountDueMinor]
      );
      if (!inserted.rows[0]) {
        const existing=(await client.query(`SELECT amount_due_minor FROM purification_obligations WHERE user_id=$1 AND obligation_key=$2`,[userId,obligation.key])).rows[0];
        if(String(existing.amount_due_minor)!==String(obligation.amountDueMinor)) throw new Error(`Purification obligation ${obligation.key} already exists with different evidence; create a correction review`);
      }
      if (inserted.rows[0]) await client.query(
        `INSERT INTO purification_obligation_events(obligation_id,user_id,event_type,evidence) VALUES($1,$2,'created',$3)`,
        [inserted.rows[0].id,userId,obligation]
      );
    }
    if (data.remindAt) await client.query(
      `INSERT INTO service_reminders(user_id,service_type,due_at,source_run_id) VALUES($1,$2,$3,$4)`,
      [userId,data.serviceType,data.remindAt,run.id]
    );
    await client.query('COMMIT');
    return run;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function getMethodology(serviceType,key,version){return (await pool.query(`SELECT * FROM methodology_packs WHERE service_type=$1 AND methodology_key=$2 AND version=$3`,[serviceType,key,version])).rows[0]||null;}
async function licensedRatios(securityKeys,asOf){if(!securityKeys.length)return new Map();const rows=(await pool.query(`SELECT DISTINCT ON(security_key) * FROM purification_ratio_datasets WHERE security_key=ANY($1::text[]) AND status='active' AND ratio_as_of<=$2 ORDER BY security_key,ratio_as_of DESC,created_at DESC`,[securityKeys,asOf])).rows;return new Map(rows.map(r=>[r.security_key,{partsPerMillion:r.ratio_parts_per_million,provider:r.provider,datasetVersion:r.dataset_version,licenseReference:r.license_reference,asOf:String(r.ratio_as_of).slice(0,10)}]));}

async function listRuns(userId, serviceType) {
  const { rows } = await pool.query(`SELECT id,service_type,methodology_key,methodology_version,methodology_review_status,result,status,created_at FROM service_runs WHERE user_id=$1 AND ($2::text IS NULL OR service_type=$2) ORDER BY created_at DESC`, [userId,serviceType || null]);
  return rows;
}
async function getRun(userId, id) { return (await pool.query('SELECT * FROM service_runs WHERE id=$1 AND user_id=$2',[id,userId])).rows[0] || null; }
async function listObligations(userId) { return (await pool.query(`SELECT * FROM purification_obligations WHERE user_id=$1 ORDER BY created_at DESC`,[userId])).rows; }
async function satisfyObligation(userId,id,evidence={}) {
  const client=await pool.connect(); try { await client.query('BEGIN');
    const row=(await client.query(`UPDATE purification_obligations SET status='satisfied',satisfied_at=NOW() WHERE id=$1 AND user_id=$2 AND status='outstanding' RETURNING *`,[id,userId])).rows[0];
    if(!row){const e=new Error('Outstanding obligation not found');e.statusCode=404;throw e;}
    await client.query(`INSERT INTO purification_obligation_events(obligation_id,user_id,event_type,evidence) VALUES($1,$2,'satisfied',$3)`,[id,userId,evidence]);
    await client.query('COMMIT'); return row;
  } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
}
module.exports={createRun,getMethodology,licensedRatios,listRuns,getRun,listObligations,satisfyObligation};
