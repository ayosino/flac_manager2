require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function initDb() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    multipleStatements: true
  });

  try {
    console.log('Applying database/schema.sql...');
    const schemaSql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8');
    await connection.query(schemaSql);

    console.log('Applying database/views.sql...');
    const viewsSql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'views.sql'), 'utf8');
    await connection.query(viewsSql);

    console.log('Database schema and views initialized successfully.');
  } finally {
    await connection.end();
  }
}

initDb().catch(err => {
  console.error('Error initializing database:', err);
  process.exit(1);
});
