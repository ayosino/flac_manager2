require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixCollation() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  try {
    console.log('Converting database and tables to utf8mb4...');
    
    await connection.query(`ALTER DATABASE ${process.env.DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    
    const tables = ['artists', 'albums', 'tracks'];
    for (const table of tables) {
      console.log(`Converting table: ${table}`);
      await connection.query(`ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    }

    console.log('Collation fix complete.');
  } catch (err) {
    console.error('Error during conversion:', err.message);
  } finally {
    await connection.end();
  }
}

fixCollation();
