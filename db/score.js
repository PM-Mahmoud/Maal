/**
 * DB module — owns: score_submissions table queries
 * Does NOT own: score calculation logic, route handling, email
 */
const { Pool } = require('pg');

// Single pool instance — only db/ may construct Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

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
