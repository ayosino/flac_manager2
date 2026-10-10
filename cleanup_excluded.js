require('dotenv').config();
const mysql = require('mysql2/promise');

async function cleanup() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  const EXCLUDE_DIRS = process.env.EXCLUDE_DIRS ? process.env.EXCLUDE_DIRS.split(',').map(d => d.trim()) : [];

  if (EXCLUDE_DIRS.length === 0) {
    console.log('No exclusion directories defined.');
    await connection.end();
    return;
  }

  try {
    for (const dir of EXCLUDE_DIRS) {
      console.log(`Cleaning up records for: ${dir}%`);
      
      // Delete tracks first due to FK
      const [trackResult] = await connection.query(`
        DELETE t FROM tracks t
        JOIN albums a ON t.album_id = a.id
        WHERE a.folder_path LIKE ?
      `, [`${dir}%`]);
      console.log(`Deleted ${trackResult.affectedRows} tracks.`);

      const [albumResult] = await connection.query(`
        DELETE FROM albums WHERE folder_path LIKE ?
      `, [`${dir}%`]);
      console.log(`Deleted ${albumResult.affectedRows} albums.`);
    }

    // Optionally cleanup artists with no tracks
    const [artistResult] = await connection.query(`
      DELETE FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM albums)
    `);
    console.log(`Deleted ${artistResult.affectedRows} orphaned artists.`);

    console.log('Cleanup complete.');
  } catch (err) {
    console.error('Cleanup failed:', err.message);
  } finally {
    await connection.end();
  }
}

cleanup();
