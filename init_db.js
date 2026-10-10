require('dotenv').config();
const mysql = require('mysql2/promise');

async function init() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  console.log('Connected to MySQL. Creating tables...');

  await connection.query(`
    CREATE TABLE IF NOT EXISTS artists (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS albums (
      id INT AUTO_INCREMENT PRIMARY KEY,
      artist_id INT,
      title VARCHAR(255) NOT NULL,
      year INT,
      cover_url VARCHAR(255),
      folder_path VARCHAR(512),
      mtime DATETIME,
      title_reading VARCHAR(255),
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (artist_id) REFERENCES artists(id),
      UNIQUE KEY (artist_id, title)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS tracks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      album_id INT,
      title VARCHAR(255) NOT NULL,
      track_number INT,
      duration INT,
      file_path VARCHAR(512) NOT NULL UNIQUE,
      mtime DATETIME,
      title_reading VARCHAR(255),
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (album_id) REFERENCES albums(id)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS playback_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      track_id INT NOT NULL,
      played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (track_id),
      INDEX (played_at),
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    )
  `);

  console.log('Tables created successfully.');
  await connection.end();
}

init().catch(err => {
  console.error('Error initializing database:', err);
  process.exit(1);
});
