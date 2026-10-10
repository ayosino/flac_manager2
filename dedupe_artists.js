require('dotenv').config();
const mysql = require('mysql2/promise');

async function deduplicate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  try {
    const [rows] = await connection.query('SELECT name, count(*) as c FROM artists GROUP BY name HAVING c > 1');
    console.log(`Found ${rows.length} duplicates.`);

    for (const row of rows) {
      const [artists] = await connection.query('SELECT id FROM artists WHERE name = ? ORDER BY id ASC', [row.name]);
      const keepId = artists[0].id;
      const removeIds = artists.slice(1).map(a => a.id);

      for (const removeId of removeIds) {
        console.log(`Merging artist ${removeId} into ${keepId} (Name: ${row.name})`);
        // Update albums to point to the kept artist
        await connection.query('UPDATE albums SET artist_id = ? WHERE artist_id = ?', [keepId, removeId]);
        // Delete the duplicate artist
        await connection.query('DELETE FROM artists WHERE id = ?', [removeId]);
      }
    }

    console.log('Restoring unique index...');
    await connection.query('ALTER TABLE artists ADD UNIQUE KEY name (name)');
    console.log('Deduplication and index restoration complete.');
  } finally {
    await connection.end();
  }
}

deduplicate();
