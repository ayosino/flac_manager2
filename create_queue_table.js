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
    console.log('Creating play_queue table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS play_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        track_id INT NOT NULL,
        sort_order INT NOT NULL,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
      )
    `);
    console.log('Table created successfully.');
  } catch (err) {
    console.error('Error creating table:', err.message);
  } finally {
    await connection.end();
  }
}

update();
