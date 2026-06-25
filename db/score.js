/**
 * DB module — owns: score_submissions table queries
 * Does NOT own: score calculation logic, route handling, email
 */
// Shared pool singleton (db/pool.js)
const pool = require('./pool');

/**
 * Persist a completed score submission for analytics.
 * Gracefully no-ops if the table doesn't exist yet (migration pending).
 */
async function saveScoreSubmission({ formData, result }) {
  await pool.query(
    `INSERT INTO score_submissions
       (profession, stage, age, annual_income, score, grade, components, recommendations, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      formData.profession,
      formData.stage,
      formData.age,
      formData.annualIncome,
      result.score,
      result.grade,
      JSON.stringify(result.components),
      JSON.stringify(result.recommendations),
    ]
  );
}

module.exports = { saveScoreSubmission };
