require('dotenv').config();
const mysql = require('mysql2/promise');
const path = require('path');

async function update() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  try {
    await connection.query('ALTER TABLE albums ADD COLUMN folder_path VARCHAR(512)');
    console.log('Added folder_path column to albums.');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('folder_path column already exists.');
    } else {
      console.error('Error adding column:', err.message);
    }
  }

  // Update existing albums with folder_path based on their tracks
  const [albums] = await connection.query('SELECT id FROM albums WHERE folder_path IS NULL');
  for (const album of albums) {
    const [tracks] = await connection.query('SELECT file_path FROM tracks WHERE album_id = ? LIMIT 1', [album.id]);
    if (tracks.length > 0) {
      const dir = path.dirname(tracks[0].file_path);
      await connection.query('UPDATE albums SET folder_path = ? WHERE id = ?', [dir, album.id]);
      console.log(`Updated album ${album.id} with path ${dir}`);
    }
  }

  console.log('Database update complete.');
  await connection.end();
}

update().catch(err => {
  console.error(err);
  process.exit(1);
});
