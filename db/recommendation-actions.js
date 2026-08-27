const pool = require('./pool');

async function syncRecommendations(userId, actions, rules, measuredAt) {
  const client = await pool.connect();
  const rows = [];
  try {
    await client.query('BEGIN');
    for (const action of actions) {
      const result = await client.query(`
      INSERT INTO recommendations
        (user_id,category,title,description,priority,impact,source_key,impact_score,urgency_score,confidence_score,effort_score,rank_score,ranking,baseline,target)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (user_id,source_key) WHERE source_key IS NOT NULL DO UPDATE SET
        category=EXCLUDED.category,title=EXCLUDED.title,description=EXCLUDED.description,
        impact=EXCLUDED.impact,impact_score=EXCLUDED.impact_score,urgency_score=EXCLUDED.urgency_score,
        confidence_score=EXCLUDED.confidence_score,effort_score=EXCLUDED.effort_score,
        rank_score=EXCLUDED.rank_score,ranking=EXCLUDED.ranking,target=EXCLUDED.target,updated_at=NOW()
      RETURNING *`, [userId, action.category, action.title, action.description, action.rank <= 2 ? 'high' : 'medium', action.impact, action.source_key, action.impact, action.urgency, action.confidence, action.effort, action.rank_score, action.ranking, action.baseline, action.target]);
      rows.push(result.rows[0]);
    }
    for (const rule of (rules || []).filter((item) => item.status === 'healthy' && item.observed?.value != null)) {
      const sourceKey = `health:${rule.key}`;
      const resolved = (await client.query(`
        WITH candidate AS (
          SELECT id,status AS previous_status
          FROM recommendations
          WHERE user_id=$1 AND source_key=$2 AND status IN ('pending','in_progress')
          FOR UPDATE
        ), updated AS (
          UPDATE recommendations r
          SET status='completed',implemented_at=$3,updated_at=$3
          FROM candidate c
          WHERE r.id=c.id
          RETURNING r.*,c.previous_status
        )
        SELECT * FROM updated`, [userId, sourceKey, measuredAt])).rows[0];
      if (!resolved) continue;
      const baseline = Number(resolved.baseline?.value), value = Number(rule.observed.value), rawChange = Number.isFinite(baseline) ? value - baseline : null;
      const delta = rawChange == null ? null : rule.target?.operator === '<=' ? -rawChange : rawChange;
      const targetMet = rule.target ? (rule.target.operator === '<=' ? value <= Number(rule.target.value) : value >= Number(rule.target.value)) : null;
      const outcomeStatus = targetMet === null ? 'measured' : targetMet ? 'target_met' : 'progressing';
      await client.query('INSERT INTO recommendation_events(recommendation_id,user_id,from_status,to_status,occurred_at) VALUES($1,$2,$3,$4,$5)', [resolved.id, userId, resolved.previous_status, 'completed', measuredAt]);
      await client.query(`INSERT INTO recommendation_outcomes(recommendation_id,user_id,metric,value,unit,baseline_value,delta,target,target_met,outcome_status,measured_at,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [resolved.id, userId, rule.key, value, rule.observed.unit || null, Number.isFinite(baseline) ? baseline : null, delta, rule.target || null, targetMet, outcomeStatus, measuredAt, 'Automatically resolved because the current health rule meets its target.']);
    }
    await client.query('COMMIT'); return rows;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function listRecommendations(userId) {
  return (await pool.query(`
    SELECT r.*,
      COALESCE((SELECT json_agg(e ORDER BY e.occurred_at) FROM recommendation_events e WHERE e.recommendation_id=r.id AND e.user_id=$1),'[]') events,
      COALESCE((SELECT json_agg(o ORDER BY o.measured_at) FROM recommendation_outcomes o WHERE o.recommendation_id=r.id AND o.user_id=$1),'[]') outcomes
    FROM recommendations r WHERE r.user_id=$1 ORDER BY r.rank_score DESC, r.created_at DESC`, [userId])).rows;
}
async function getRecommendation(userId, id) { return (await pool.query('SELECT * FROM recommendations WHERE id=$1 AND user_id=$2', [id, userId])).rows[0] || null; }

async function recordTransition(userId, id, event, outcome) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = (await client.query(`UPDATE recommendations SET status=$3,implemented_at=CASE WHEN $3='completed' THEN $4 ELSE implemented_at END,updated_at=$4 WHERE id=$1 AND user_id=$2 AND status=$5 RETURNING *`, [id, userId, event.to_status, event.occurred_at, event.from_status])).rows[0];
    if (!updated) throw Object.assign(new Error('Recommendation changed; reload and try again.'), { status: 409 });
    await client.query(`INSERT INTO recommendation_events(recommendation_id,user_id,from_status,to_status,occurred_at) VALUES($1,$2,$3,$4,$5)`, [id, userId, event.from_status, event.to_status, event.occurred_at]);
    if (outcome) await client.query(`INSERT INTO recommendation_outcomes(recommendation_id,user_id,metric,value,unit,baseline_value,delta,target,target_met,outcome_status,measured_at,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [id, userId, outcome.metric, outcome.value, outcome.unit, outcome.baseline_value, outcome.delta, outcome.target, outcome.target_met, outcome.outcome_status, outcome.measured_at, outcome.note || null]);
    await client.query('COMMIT'); return updated;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function addOutcome(userId, id, outcome) {
  return (await pool.query(`INSERT INTO recommendation_outcomes(recommendation_id,user_id,metric,value,unit,baseline_value,delta,target,target_met,outcome_status,measured_at,note)
    SELECT r.id,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12 FROM recommendations r WHERE r.id=$1 AND r.user_id=$2 RETURNING *`, [id, userId, outcome.metric, outcome.value, outcome.unit, outcome.baseline_value, outcome.delta, outcome.target, outcome.target_met, outcome.outcome_status, outcome.measured_at, outcome.note || null])).rows[0] || null;
}
module.exports = { syncRecommendations, listRecommendations, getRecommendation, recordTransition, addOutcome };
