require('dotenv').config();
const mysql = require('mysql2/promise');

async function update() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  try {
    console.log('Updating schema...');

    // Albums
    await connection.query('ALTER TABLE albums ADD COLUMN mtime DATETIME');
    await connection.query('ALTER TABLE albums ADD COLUMN title_reading VARCHAR(255)');
    
    // Tracks
    await connection.query('ALTER TABLE tracks ADD COLUMN mtime DATETIME');
    await connection.query('ALTER TABLE tracks ADD COLUMN title_reading VARCHAR(255)');

    // Artists
    await connection.query('ALTER TABLE artists ADD COLUMN name_reading VARCHAR(255)');

    console.log('Schema update complete.');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('Columns already exist, skipping.');
    } else {
      console.error('Schema update failed:', err.message);
    }
  } finally {
    await connection.end();
  }
}

update();
