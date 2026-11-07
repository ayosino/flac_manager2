const { spawn } = require('child_process');
const { pool, getExcludedTrackIds } = require('../config/db');

let faiss = null;
try {
  faiss = require('faiss-node');
} catch (e) {
  console.warn('faiss-node not available, autoplay similarity search disabled.');
}

let faissIndex = null;
let trackIdMap = [];

async function initFaiss() {
  if (!faiss) return;
  try {
    const [tables] = await pool.query("SHOW TABLES LIKE 'track_vectors'");
    if (tables.length === 0) return;

    const [rows] = await pool.query(
      'SELECT t.id as track_id, tv.vector FROM track_vectors tv JOIN tracks t ON tv.file_path = t.file_path'
    );
    if (rows.length === 0) {
      console.log('No vectors found in track_vectors matching tracks.');
      return;
    }

    console.log(`Decoding ${rows.length} vectors via streaming Python bridge...`);
    const pythonScript = `
import pickle, sys, json
try:
    stream = sys.stdin.buffer
    vectors = []
    while True:
        try:
            v = pickle.load(stream)
            vectors.append(v.tolist() if hasattr(v, "tolist") else list(v))
        except EOFError:
            break
    print(json.dumps(vectors))
except Exception as e:
    import traceback
    sys.stderr.write(traceback.format_exc())
    sys.exit(1)
`;

    const py = spawn('python3', ['-c', pythonScript]);
    let stdoutData = '';
    let stderrData = '';
    py.stdout.on('data', (data) => { stdoutData += data; });
    py.stderr.on('data', (data) => { stderrData += data; });

    const pyPromise = new Promise((resolve, reject) => {
      py.on('close', (code) => {
        if (code === 0) resolve(stdoutData);
        else reject(new Error(stderrData || `Python exited with code ${code}`));
      });
    });

    for (const row of rows) {
      py.stdin.write(row.vector);
    }
    py.stdin.end();

    const resultOutput = await pyPromise;
    const decVectors = JSON.parse(resultOutput);
    if (!Array.isArray(decVectors) || decVectors.length === 0) return;

    const dim = decVectors[0].length;
    faissIndex = new faiss.IndexFlatL2(dim);
    trackIdMap = [];

    for (let i = 0; i < decVectors.length; i++) {
      const vec = decVectors[i];
      if (Array.isArray(vec) && vec.length === dim) {
        faissIndex.add(vec);
        trackIdMap.push(rows[i].track_id);
      }
    }
    console.log(`FAISS initialized with ${faissIndex.ntotal()} vectors of dimension ${dim}.`);
  } catch (err) {
    console.error('Error initializing FAISS:', err);
  }
}

async function decodeSingleVector(blob) {
  const pythonScript = `
import pickle, sys, json
try:
    v = pickle.load(sys.stdin.buffer)
    print(json.dumps(v.tolist() if hasattr(v, "tolist") else list(v)))
except Exception:
    sys.exit(1)
`;
  const py = spawn('python3', ['-c', pythonScript]);
  let stdoutData = '';
  py.stdout.on('data', (d) => { stdoutData += d; });
  const pyPromise = new Promise((resolve) => {
    py.on('close', (code) => resolve(code === 0 ? stdoutData : null));
  });
  py.stdin.write(blob);
  py.stdin.end();
  const out = await pyPromise;
  if (!out) return null;
  const vec = JSON.parse(out);
  return Array.isArray(vec) ? vec : null;
}

async function getRecommendations(trackId, limit = 5) {
  if (!faissIndex) return [];

  let [rows] = await pool.query(
    `SELECT tv.vector FROM track_vectors tv JOIN tracks t ON tv.file_path = t.file_path WHERE t.id = ?`,
    [trackId]
  );

  // Fallback by manual_genre / category if seed track has no vector
  if (rows.length === 0) {
    [rows] = await pool.query(
      `SELECT tv.vector
       FROM track_vectors tv
       JOIN tracks t ON tv.file_path = t.file_path
       JOIN albums a ON t.album_id = a.id
       WHERE a.manual_genre = (
         SELECT a2.manual_genre FROM tracks t2 JOIN albums a2 ON t2.album_id = a2.id WHERE t2.id = ?
       )
       ORDER BY RAND() LIMIT 1`,
      [trackId]
    );

    if (rows.length === 0) {
      const [categoryTracks] = await pool.query(
        `SELECT t.id, t.title, t.duration, t.album_id, a.title as album_title, a.cover_url,
                COALESCE(t.track_artist, art.name) as artist_name
         FROM tracks t
         JOIN albums a ON t.album_id = a.id
         JOIN artists art ON a.artist_id = art.id
         WHERE a.manual_genre = (
           SELECT a2.manual_genre FROM tracks t2 JOIN albums a2 ON t2.album_id = a2.id WHERE t2.id = ?
         ) AND t.id != ?
         ORDER BY RAND() LIMIT ?`,
        [trackId, trackId, limit]
      );
      if (categoryTracks.length > 0) return categoryTracks;

      const [randomTracks] = await pool.query(
        `SELECT t.id, t.title, t.duration, t.album_id, a.title as album_title, a.cover_url,
                COALESCE(t.track_artist, art.name) as artist_name
         FROM tracks t
         JOIN albums a ON t.album_id = a.id
         JOIN artists art ON a.artist_id = art.id
         ORDER BY RAND() LIMIT ?`,
        [limit]
      );
      return randomTracks;
    }
  }

  const vec = await decodeSingleVector(rows[0].vector);
  if (!vec) return [];

  const k = Math.min(100, faissIndex.ntotal());
  if (k === 0) return [];
  const searchRes = faissIndex.search(vec, k);

  const excludedIds = await getExcludedTrackIds();
  let candidateIds = searchRes.labels
    .map(label => trackIdMap[label])
    .filter(id => id !== undefined && id !== trackId && !excludedIds.has(id));

  if (candidateIds.length === 0) {
    const [queued] = await pool.query('SELECT track_id FROM play_queue');
    const queuedIds = new Set(queued.map(r => r.track_id));
    candidateIds = searchRes.labels
      .map(label => trackIdMap[label])
      .filter(id => id !== undefined && id !== trackId && !queuedIds.has(id));
    if (candidateIds.length === 0) {
      candidateIds = searchRes.labels
        .map(label => trackIdMap[label])
        .filter(id => id !== undefined && id !== trackId);
    }
  }

  if (candidateIds.length === 0) return [];

  const [candidatesMetadata] = await pool.query(
    `SELECT t.id, t.title, t.duration, t.album_id, a.title as album_title, a.cover_url, a.folder_path,
            COALESCE(t.track_artist, art.name) as artist_name
     FROM tracks t
     JOIN albums a ON t.album_id = a.id
     JOIN artists art ON a.artist_id = art.id
     WHERE t.id IN (?)`,
    [candidateIds.slice(0, 50)]
  );

  const candidatesMap = {};
  candidatesMetadata.forEach(c => { candidatesMap[c.id] = c; });

  const [seedInfo] = await pool.query(
    'SELECT a.folder_path FROM tracks t JOIN albums a ON t.album_id = a.id WHERE t.id = ?',
    [trackId]
  );
  let lastFolder = seedInfo.length > 0 ? seedInfo[0].folder_path : null;

  const resultTracks = [];
  const usedIds = new Set();

  while (resultTracks.length < limit && usedIds.size < candidateIds.length) {
    let nextTrack = null;
    for (const id of candidateIds) {
      if (usedIds.has(id)) continue;
      const candidate = candidatesMap[id];
      if (!candidate) continue;
      if (candidate.folder_path !== lastFolder) {
        nextTrack = candidate;
        break;
      }
    }
    if (!nextTrack) {
      for (const id of candidateIds) {
        if (!usedIds.has(id) && candidatesMap[id]) {
          nextTrack = candidatesMap[id];
          break;
        }
      }
    }
    if (nextTrack) {
      resultTracks.push(nextTrack);
      usedIds.add(nextTrack.id);
      lastFolder = nextTrack.folder_path;
    } else {
      break;
    }
  }

  return resultTracks;
}

async function generateAutogenPlaylist(limit = 20) {
  if (!faissIndex || trackIdMap.length === 0) {
    const err = new Error('FAISS index not initialized or empty');
    err.statusCode = 503;
    throw err;
  }

  const seedTrackId = trackIdMap[Math.floor(Math.random() * trackIdMap.length)];
  const [seedRows] = await pool.query(
    `SELECT tv.vector FROM track_vectors tv JOIN tracks t ON tv.file_path = t.file_path WHERE t.id = ?`,
    [seedTrackId]
  );
  if (seedRows.length === 0) return [];

  const seedVec = await decodeSingleVector(seedRows[0].vector);
  if (!seedVec) return [];

  const k = Math.min(200, faissIndex.ntotal());
  const searchRes = faissIndex.search(seedVec, k);

  const excludedIds = await getExcludedTrackIds();
  let candidateIds = searchRes.labels
    .map(label => trackIdMap[label])
    .filter(id => id !== undefined && !excludedIds.has(id));

  if (candidateIds.length < limit) {
    const [queued] = await pool.query('SELECT track_id FROM play_queue');
    const queuedIds = new Set(queued.map(r => r.track_id));
    candidateIds = searchRes.labels
      .map(label => trackIdMap[label])
      .filter(id => id !== undefined && !queuedIds.has(id));
    if (candidateIds.length < limit) {
      candidateIds = searchRes.labels.map(label => trackIdMap[label]).filter(id => id !== undefined);
    }
  }

  const [candidatesMetadata] = await pool.query(
    `SELECT t.id, t.title, t.duration, t.album_id, a.title as album_title, a.cover_url, a.folder_path,
            COALESCE(t.track_artist, art.name) as artist_name
     FROM tracks t
     JOIN albums a ON t.album_id = a.id
     JOIN artists art ON a.artist_id = art.id
     WHERE t.id IN (?)`,
    [candidateIds.slice(0, 100)]
  );

  const candidatesMap = {};
  candidatesMetadata.forEach(c => { candidatesMap[c.id] = c; });

  const resultTracks = [];
  const usedIds = new Set();

  const current = candidatesMap[seedTrackId];
  if (current && !excludedIds.has(seedTrackId)) {
    resultTracks.push(current);
    usedIds.add(current.id);
  }

  while (resultTracks.length < limit && usedIds.size < candidateIds.length) {
    const prevFolder = resultTracks.length > 0 ? resultTracks[resultTracks.length - 1].folder_path : null;
    let nextTrack = null;

    for (const id of candidateIds) {
      if (usedIds.has(id)) continue;
      const candidate = candidatesMap[id];
      if (!candidate) continue;
      if (candidate.folder_path !== prevFolder) {
        nextTrack = candidate;
        break;
      }
    }
    if (!nextTrack) {
      for (const id of candidateIds) {
        if (!usedIds.has(id) && candidatesMap[id]) {
          nextTrack = candidatesMap[id];
          break;
        }
      }
    }
    if (nextTrack) {
      resultTracks.push(nextTrack);
      usedIds.add(nextTrack.id);
    } else {
      break;
    }
  }

  return resultTracks;
}

module.exports = {
  initFaiss,
  getRecommendations,
  generateAutogenPlaylist
};
