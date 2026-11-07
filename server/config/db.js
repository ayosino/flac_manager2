const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database connection:', err);
});

const EXCLUDE_DIRS = process.env.EXCLUDE_DIRS
  ? process.env.EXCLUDE_DIRS.split(',').map(d => d.trim()).filter(Boolean)
  : [];

function getExcludeClause(alias = 'a') {
  if (EXCLUDE_DIRS.length === 0) return '';
  return EXCLUDE_DIRS.map(() => ` AND ${alias}.folder_path NOT LIKE ?`).join('');
}

function getExcludeParams() {
  return EXCLUDE_DIRS.map(d => `${d}%`);
}

async function getExcludedTrackIds() {
  const [queued] = await pool.query('SELECT track_id FROM play_queue');
  const [history] = await pool.query('SELECT track_id FROM playback_history ORDER BY played_at DESC LIMIT 100');
  return new Set([...queued.map(r => r.track_id), ...history.map(r => r.track_id)]);
}

module.exports = {
  pool,
  EXCLUDE_DIRS,
  getExcludeClause,
  getExcludeParams,
  getExcludedTrackIds
};
