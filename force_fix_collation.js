require('dotenv').config();
const mysql = require('mysql2/promise');

async function fix() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    charset: 'utf8mb4'
  });

  try {
    console.log('Setting database default charset...');
    await connection.query(`ALTER DATABASE ${process.env.DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    const tables = ['tracks', 'albums', 'artists']; // Order matters for FKs if we were dropping them, but CONVERT TO is usually fine
    
    for (const table of tables) {
      console.log(`Converting table ${table}...`);
      try {
        await connection.query(`ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      } catch (err) {
        console.error(`Failed to convert ${table}: ${err.message}`);
        if (err.message.includes('Duplicate entry')) {
          console.log(`Attempting to find duplicates in ${table}...`);
          // For artists, name is unique
          if (table === 'artists') {
             const [rows] = await connection.query('SELECT name, COUNT(*) as c FROM artists GROUP BY name HAVING c > 1');
             console.log('Duplicates found:', rows);
          }
        }
      }
    }

    console.log('Done.');
  } finally {
    await connection.end();
  }
}

fix();
