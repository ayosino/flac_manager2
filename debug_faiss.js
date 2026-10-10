require('dotenv').config();
const mysql = require('mysql2/promise');
const { spawnSync } = require('child_process');

async function debug() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: 1
  });

  try {
    console.log('Fetching 100 vectors...');
    const [rows] = await pool.query('SELECT vector FROM track_vectors LIMIT 100');
    if (rows.length === 0) {
      console.log('No vectors found.');
      return;
    }

    const pythonScript = `
import pickle, sys, json, numpy
vectors = []
try:
    stream = sys.stdin.buffer
    while True:
        try:
            v = pickle.load(stream)
            # Check type of v
            # print(f"Loaded: {type(v)}", file=sys.stderr)
            vectors.append(v.tolist() if hasattr(v, "tolist") else list(v))
        except EOFError:
            break
except Exception as e:
    import traceback
    sys.stderr.write(traceback.format_exc())
    sys.exit(1)
print(json.dumps(vectors))
`;

    const inputBuffer = Buffer.concat(rows.map(r => r.vector));
    console.log('Calling Python bridge...');
    const result = spawnSync('python3', ['-c', pythonScript], { input: inputBuffer });

    if (result.status !== 0) {
      console.error('Python bridge error (status ' + result.status + '):');
      console.error(result.stderr.toString());
    } else {
      console.log('Successfully decoded ' + JSON.parse(result.stdout.toString()).length + ' vectors.');
    }
  } catch (err) {
    console.error('Database/Script error:', err);
  } finally {
    await pool.end();
  }
}

debug();
