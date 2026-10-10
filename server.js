require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const wanakana = require('wanakana');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});
app.use('/covers', express.static(path.join(__dirname, 'public', 'covers')));
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database connection', err);
});

const EXCLUDE_DIRS = process.env.EXCLUDE_DIRS ? process.env.EXCLUDE_DIRS.split(',').map(d => d.trim()) : [];

function getExcludeClause(alias = 'a') {
  if (EXCLUDE_DIRS.length === 0) return '';
  return EXCLUDE_DIRS.map(() => ` AND ${alias}.folder_path NOT LIKE ?`).join('');
}

function getExcludeParams() {
  return EXCLUDE_DIRS.map(d => `${d}%`);
}

async function getExcludedTrackIds() {
  const [queued] = await pool.query('SELECT track_id FROM play_queue');
  const [history] = await pool.query('SELECT track_id FROM playback_history ORDER BY played_at DESC LIMIT 100');
  const excluded = new Set([...queued.map(r => r.track_id), ...history.map(r => r.track_id)]);
  return excluded;
}

// API: List all albums with pagination and search
app.get('/api/albums', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const sort = req.query.sort || 'alpha'; // 'alpha' or 'newest'
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];
    
    // Apply exclusion
    whereClause += getExcludeClause('a');
    params.push(...getExcludeParams());

    if (search) {
      const searchKana = wanakana.toKatakana(search);
      whereClause += ' AND (a.title LIKE ? OR art.name LIKE ? OR a.folder_path LIKE ? OR a.title_reading LIKE ? OR art.name_reading LIKE ?)';
      const p = `%${search}%`;
      const pk = `%${searchKana}%`;
      params.push(p, p, p, pk, pk);
    }

    const [totalRows] = await pool.query(`
      SELECT COUNT(*) as count 
      FROM albums a 
      JOIN artists art ON a.artist_id = art.id
      ${whereClause}
    `, params);

    let orderBy;
    if (sort === 'newest') {
      orderBy = 'a.mtime DESC, a.id DESC';
    } else if (sort === 'added') {
      orderBy = 'a.added_at DESC, a.id DESC';
    } else if (sort === 'id_desc' || sort === 'id') {
      orderBy = 'a.id DESC';
    } else if (sort === 'id_asc') {
      orderBy = 'a.id ASC';
    } else {
      orderBy = 'art.name, a.title';
    }

    const [rows] = await pool.query(`
      SELECT a.id, a.title, a.year, a.cover_url, a.folder_path, a.mtime, a.added_at, art.name as artist_name 
      FROM albums a 
      JOIN artists art ON a.artist_id = art.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.json({
      data: rows,
      totalCount: totalRows[0].count,
      page,
      limit,
      totalPages: Math.ceil(totalRows[0].count / limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: List random albums
app.get('/api/random', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    let whereClause = 'WHERE 1=1';
    let params = [];
    whereClause += getExcludeClause('a');
    params.push(...getExcludeParams());

    const [rows] = await pool.query(`
      SELECT a.id, a.title, a.year, a.cover_url, a.folder_path, a.mtime, art.name as artist_name 
      FROM albums a 
      JOIN artists art ON a.artist_id = art.id
      ${whereClause}
      ORDER BY RAND()
      LIMIT ?
    `, [...params, limit]);

    res.json({
      data: rows,
      totalCount: rows.length,
      page: 1,
      limit,
      totalPages: 1
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: List all artists with pagination and search
app.get('/api/artists', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const sort = req.query.sort || 'alpha';
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];

    if (EXCLUDE_DIRS.length > 0) {
      whereClause += ` AND EXISTS (SELECT 1 FROM albums alb WHERE alb.artist_id = artists.id ${getExcludeClause('alb')})`;
      params.push(...getExcludeParams());
    }

    if (search) {
      const searchKana = wanakana.toKatakana(search);
      // Search in name, reading, AND album folder paths
      whereClause += ` AND (
        name LIKE ? 
        OR name_reading LIKE ? 
        OR EXISTS (SELECT 1 FROM albums alb WHERE alb.artist_id = artists.id AND alb.folder_path LIKE ?)
      )`;
      const p = `%${search}%`;
      const pk = `%${searchKana}%`;
      params.push(p, pk, p);
    }

    const [totalRows] = await pool.query(`SELECT COUNT(*) as count FROM artists ${whereClause}`, params);
    
    let orderBy;
    if (sort === 'newest') {
      orderBy = '(SELECT MAX(mtime) FROM albums WHERE artist_id = artists.id) DESC';
    } else if (sort === 'added') {
      orderBy = '(SELECT MAX(added_at) FROM albums WHERE artist_id = artists.id) DESC';
    } else if (sort === 'id_desc' || sort === 'id') {
      orderBy = 'id DESC';
    } else if (sort === 'id_asc') {
      orderBy = 'id ASC';
    } else {
      orderBy = 'name';
    }

    const [rows] = await pool.query(`
      SELECT id, name, 
        (SELECT folder_path FROM albums WHERE artist_id = artists.id LIMIT 1) as folder_path
      FROM artists 
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.json({
      data: rows,
      totalCount: totalRows[0].count,
      page,
      limit,
      totalPages: Math.ceil(totalRows[0].count / limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: List albums for an artist
app.get('/api/artists/:id/albums', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, title, year, cover_url, folder_path 
      FROM albums 
      WHERE artist_id = ? 
      ORDER BY year DESC, title
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: List all tracks for an artist
app.get('/api/artists/:id/tracks', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.id, t.title, t.duration, art.name as artist_name 
      FROM tracks t
      JOIN albums a ON t.album_id = a.id
      JOIN artists art ON a.artist_id = art.id
      WHERE art.id = ?
      ORDER BY a.year DESC, a.title, t.track_number, t.title
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Browse folders hierarchically
app.get('/api/folders/browse', async (req, res) => {
  try {
    const parentPath = req.query.path || process.env.MUSIC_DIR;
    
    // Normalize path: ensure it ends with / for prefix matching
    const prefix = parentPath.endsWith('/') ? parentPath : parentPath + '/';

    // 1. Find immediate subfolders
    const [folderRows] = await pool.query(`
      SELECT DISTINCT 
        SUBSTRING_INDEX(SUBSTRING(folder_path, ?), '/', 1) as name
      FROM albums 
      WHERE folder_path LIKE ?
      AND folder_path != ?
      ${getExcludeClause('albums')}
    `, [prefix.length + 1, prefix + '%', parentPath, ...getExcludeParams()]);

    const folders = folderRows
      .map(r => r.name)
      .filter(name => name && name !== '')
      // Also filter out any folder that would be entirely excluded
      .filter(name => {
        const fullPath = path.join(parentPath, name);
        return !EXCLUDE_DIRS.some(exclude => fullPath === exclude);
      })
      .map(name => ({
        name,
        path: path.join(parentPath, name)
      }));

    // 2. Find albums in THIS EXACT folder
    const [albumRows] = await pool.query(`
      SELECT a.id, a.title, a.year, a.cover_url, art.name as artist_name 
      FROM albums a 
      JOIN artists art ON a.artist_id = art.id
      WHERE a.folder_path = ?
      ${getExcludeClause('a')}
    `, [parentPath, ...getExcludeParams()]);

    res.json({
      currentPath: parentPath,
      folders,
      albums: albumRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: List albums in a folder
app.get('/api/folders/albums', async (req, res) => {
  try {
    const folderPath = req.query.path;
    const [rows] = await pool.query(`
      SELECT a.id, a.title, a.year, a.cover_url, art.name as artist_name 
      FROM albums a 
      JOIN artists art ON a.artist_id = art.id
      WHERE a.folder_path = ?
      ${getExcludeClause('a')}
      ORDER BY a.title
    `, [folderPath, ...getExcludeParams()]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: List all tracks under a folder path (including subfolders)
app.get('/api/folders/tracks', async (req, res) => {
  try {
    const folderPath = req.query.path;
    if (!folderPath) return res.status(400).json({ error: 'Path is required' });

    const [rows] = await pool.query(`
      SELECT t.id, t.title, t.duration, art.name as artist_name 
      FROM tracks t
      JOIN albums a ON t.album_id = a.id
      JOIN artists art ON a.artist_id = art.id
      WHERE a.folder_path LIKE ?
      ${getExcludeClause('a')}
      ORDER BY a.folder_path, a.title, t.track_number, t.title
    `, [`${folderPath}%`, ...getExcludeParams()]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: List all tracks for an album
app.get('/api/albums/:id/tracks', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, title, track_number, duration 
      FROM tracks 
      WHERE album_id = ? 
      ORDER BY track_number, title
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Persistent Queue APIs ---

// GET /api/queue: Fetch entire queue with metadata
app.get('/api/queue', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT q.id as queue_id, t.id, t.title, t.duration, art.name as artist_name
      FROM play_queue q
      JOIN tracks t ON q.track_id = t.id
      JOIN albums a ON t.album_id = a.id
      JOIN artists art ON a.artist_id = art.id
      ORDER BY q.sort_order, q.id
    `);
    console.log(`GET /api/queue: Returning ${rows.length} items`);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/queue error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue: Add one or more tracks to the queue
app.post('/api/queue', async (req, res) => {
  try {
    const { trackIds } = req.body; // Expects { trackIds: [id1, id2, ...] }
    console.log(`POST /api/queue: Adding ${trackIds ? trackIds.length : 0} tracks`);
    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return res.status(400).json({ error: 'trackIds array is required' });
    }

    // Get current max sort_order
    const [maxRows] = await pool.query('SELECT MAX(sort_order) as max_so FROM play_queue');
    let nextOrder = (maxRows[0].max_so || 0) + 1;

    const values = trackIds.map(id => [id, nextOrder++]);
    await pool.query('INSERT INTO play_queue (track_id, sort_order) VALUES ?', [values]);

    res.json({ success: true, added: trackIds.length });
  } catch (err) {
    console.error('POST /api/queue error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/queue/:id: Remove a specific item from the queue
app.delete('/api/queue/:id', async (req, res) => {
  try {
    console.log(`DELETE /api/queue/${req.params.id}`);
    await pool.query('DELETE FROM play_queue WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(`DELETE /api/queue/${req.params.id} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue/clear: Clear the entire queue
app.post('/api/queue/clear', async (req, res) => {
  try {
    console.log('POST /api/queue/clear: Clearing entire queue');
    await pool.query('DELETE FROM play_queue'); // TRUNCATE instead of DELETE to ensure foreign keys are handled correctly if needed, but DELETE is safer for triggers/hooks
    await pool.query('UPDATE playback_state SET current_queue_id = NULL, seek_position = 0 WHERE id = 1');
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/queue/clear error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Playback State APIs ---

// GET /api/playback-state: Get current playback state
app.get('/api/playback-state', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT current_queue_id, seek_position FROM playback_state WHERE id = 1');
    console.log('GET /api/playback-state:', rows[0]);
    res.json(rows[0] || { current_queue_id: null, seek_position: 0 });
  } catch (err) {
    console.error('GET /api/playback-state error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playback-state: Save current playback state
app.post('/api/playback-state', async (req, res) => {
  try {
    const { current_queue_id, seek_position } = req.body;
    console.log(`POST /api/playback-state: queue_id=${current_queue_id}, seek=${seek_position}`);
    await pool.query(
      'UPDATE playback_state SET current_queue_id = ?, seek_position = ? WHERE id = 1',
      [current_queue_id || null, seek_position || 0]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/playback-state error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- History APIs ---

// POST /api/history: Record track playback history
app.post('/api/history', async (req, res) => {
  try {
    const { trackId } = req.body;
    if (!trackId) {
      return res.status(400).json({ error: 'trackId is required' });
    }
    await pool.query('INSERT INTO playback_history (track_id) VALUES (?)', [trackId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/history: Get playback history
app.get('/api/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const [rows] = await pool.query(`
      SELECT h.id, h.played_at, t.title, t.duration, art.name as artist_name, a.title as album_title
      FROM playback_history h
      JOIN tracks t ON h.track_id = t.id
      JOIN albums a ON t.album_id = a.id
      JOIN artists art ON a.artist_id = art.id
      ORDER BY h.played_at DESC
      LIMIT ?
    `, [limit]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Playlist Management APIs ---

// GET /api/playlists: List all playlists with track counts
app.get('/api/playlists', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.id, p.name, p.created_at, COUNT(pt.id) as track_count
      FROM playlists p
      LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
      GROUP BY p.id
      ORDER BY p.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playlists: Create a new playlist
app.post('/api/playlists', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const [result] = await pool.query('INSERT INTO playlists (name) VALUES (?)', [name]);
    res.json({ id: result.insertId, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/playlists/:id/tracks: Get all tracks in a playlist
app.get('/api/playlists/:id/tracks', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT pt.id as playlist_track_id, t.id, t.title, t.duration, art.name as artist_name
      FROM playlist_tracks pt
      JOIN tracks t ON pt.track_id = t.id
      JOIN albums a ON t.album_id = a.id
      JOIN artists art ON a.artist_id = art.id
      WHERE pt.playlist_id = ?
      ORDER BY pt.sort_order, pt.id
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playlists/:id/tracks: Add one or more tracks to a playlist
app.post('/api/playlists/:id/tracks', async (req, res) => {
  try {
    const { trackIds } = req.body;
    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return res.status(400).json({ error: 'trackIds array is required' });
    }

    const [maxRows] = await pool.query('SELECT MAX(sort_order) as max_so FROM playlist_tracks WHERE playlist_id = ?', [req.params.id]);
    let nextOrder = (maxRows[0].max_so || 0) + 1;

    const values = trackIds.map(trackId => [req.params.id, trackId, nextOrder++]);
    await pool.query('INSERT INTO playlist_tracks (playlist_id, track_id, sort_order) VALUES ?', [values]);

    res.json({ success: true, added: trackIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/playlists/:id: Delete a playlist
app.delete('/api/playlists/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM playlists WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/playlists/:playlistId/tracks/:playlistTrackId: Remove a track from a playlist
app.delete('/api/playlists/:playlistId/tracks/:playlistTrackId', async (req, res) => {
  try {
    await pool.query('DELETE FROM playlist_tracks WHERE id = ? AND playlist_id = ?', [req.params.playlistTrackId, req.params.playlistId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Stream a track (unchanged)
app.get('/api/stream/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT file_path FROM tracks WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).send('Track not found');

    const filePath = rows[0].file_path;
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/flac',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'audio/flac',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let faiss = null;
try {
  faiss = require('faiss-node');
} catch (e) {
  console.warn("faiss-node not available, autoplay similarity search disabled.");
}

let faissIndex = null;
let trackIdMap = [];

const { spawn } = require('child_process');

async function initFaiss() {
  if (!faiss) return;
  try {
    const [tables] = await pool.query("SHOW TABLES LIKE 'track_vectors'");
    if (tables.length === 0) {
      console.log('Creating track_vectors table...');
      await pool.query(`CREATE TABLE track_vectors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_path VARCHAR(512) UNIQUE,
        vector LONGBLOB
      )`);
      return;
    }

    const [rows] = await pool.query('SELECT t.id as track_id, tv.vector FROM track_vectors tv JOIN tracks t ON tv.file_path = t.file_path');
    if (rows.length === 0) {
      console.log('No vectors found in track_vectors table matching tracks.');
      return;
    }
    
    console.log(`Decoding ${rows.length} vectors via streaming Python bridge...`);
    
    const pythonScript = `
import pickle, sys, json, numpy
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
    
    let stdoutData = '', stderrData = '';
    py.stdout.on('data', (data) => { stdoutData += data; });
    py.stderr.on('data', (data) => { stderrData += data; });

    const pyPromise = new Promise((resolve, reject) => {
      py.on('close', (code) => {
        if (code === 0) resolve(stdoutData);
        else reject(new Error(stderrData || `Python exited with code ${code}`));
      });
    });

    // Write all vectors to stdin
    for (const row of rows) {
      py.stdin.write(row.vector);
    }
    py.stdin.end();

    const resultOutput = await pyPromise;
    const decVectors = JSON.parse(resultOutput);

    if (!Array.isArray(decVectors) || decVectors.length === 0) {
      console.log('No valid vectors decoded.');
      return;
    }

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
  } catch(err) {
    console.error('Error initializing FAISS:', err);
  }
}

// API: Get recommended tracks based on FAISS vector similarity
app.get('/api/recommendations/:trackId', async (req, res) => {
  if (!faissIndex) return res.json([]);
  try {
    const trackId = parseInt(req.params.trackId);
    const limit = parseInt(req.query.limit) || 5;

    // 1. Try to get vector for the requested track
    let [rows] = await pool.query(`
      SELECT tv.vector FROM track_vectors tv
      JOIN tracks t ON tv.file_path = t.file_path
      WHERE t.id = ?
    `, [trackId]);

    // 2. Fallback: Find a random track with a vector in the same top-level category (/mnt/y/NextLevel/)
    if (rows.length === 0) {
      console.log(`Track ${trackId} has no vector. Looking for fallback in the same top-level category...`);
      [rows] = await pool.query(`
        SELECT tv.vector FROM track_vectors tv
        JOIN tracks t ON tv.file_path = t.file_path
        JOIN albums a ON t.album_id = a.id
        WHERE a.folder_path LIKE CONCAT(
          SUBSTRING_INDEX((
            SELECT a2.folder_path FROM tracks t2
            JOIN albums a2 ON t2.album_id = a2.id
            WHERE t2.id = ?
          ), '/', 4), '/%'
        )
        ORDER BY RAND() LIMIT 1
      `, [trackId]);
      
      if (rows.length === 0) {
        console.log(`No track with vector found in the same category. Returning 5 random tracks from the category.`);
        const [categoryTracks] = await pool.query(`
          SELECT t.id, t.title, t.duration, art.name as artist_name 
          FROM tracks t
          JOIN albums a ON t.album_id = a.id
          JOIN artists art ON a.artist_id = art.id
          WHERE a.folder_path LIKE CONCAT(
            SUBSTRING_INDEX((
              SELECT a2.folder_path FROM tracks t2
              JOIN albums a2 ON t2.album_id = a2.id
              WHERE t2.id = ?
            ), '/', 4), '/%'
          )
          AND t.id != ?
          ORDER BY RAND() LIMIT 5
        `, [trackId, trackId]);

        if (categoryTracks.length > 0) return res.json(categoryTracks);

        // 4. Absolute Last Resort: 5 random tracks from anywhere
        console.log(`Category is empty or only contains current track. Returning 5 random tracks from library.`);
        const [randomTracks] = await pool.query(`
          SELECT t.id, t.title, t.duration, art.name as artist_name 
          FROM tracks t
          JOIN albums a ON t.album_id = a.id
          JOIN artists art ON a.artist_id = art.id
          ORDER BY RAND() LIMIT 5
        `);
        return res.json(randomTracks);
      }
      console.log(`Found fallback track in the same category.`);
    }
    
    const pythonScript = `
import pickle, sys, json, numpy
try:
    v = pickle.load(sys.stdin.buffer)
    print(json.dumps(v.tolist() if hasattr(v, "tolist") else list(v)))
except Exception as e:
    sys.exit(1)
`;
    const py = spawn('python3', ['-c', pythonScript]);
    let stdoutData = '';
    py.stdout.on('data', (d) => { stdoutData += d; });
    const pyPromise = new Promise((resolve) => {
      py.on('close', (code) => {
        if (code === 0) resolve(stdoutData);
        else resolve(null);
      });
    });
    py.stdin.write(rows[0].vector);
    py.stdin.end();

    const resultOutput = await pyPromise;
    if (!resultOutput) return res.json([]);

    const vec = JSON.parse(resultOutput);
    if (!Array.isArray(vec)) return res.json([]);

    // Increase search limit to 100 to have enough candidates after filtering
    const k = Math.min(100, faissIndex.ntotal());
    if (k === 0) return res.json([]);
    const searchRes = faissIndex.search(vec, k);
    
    const excludedIds = await getExcludedTrackIds();
    const candidateIds = searchRes.labels
      .map(label => trackIdMap[label])
      .filter(id => id !== undefined && id !== trackId && !excludedIds.has(id));

    if (candidateIds.length === 0) {
      // If everything was filtered out, relax the constraint slightly (e.g. don't filter history, just queue)
      const [queued] = await pool.query('SELECT track_id FROM play_queue');
      const queuedIds = new Set(queued.map(r => r.track_id));
      const relaxedCandidates = searchRes.labels
        .map(label => trackIdMap[label])
        .filter(id => id !== undefined && id !== trackId && !queuedIds.has(id));
      
      if (relaxedCandidates.length > 0) {
        candidateIds.push(...relaxedCandidates);
      } else {
        // Absolute fallback: use the original results if even relaxed filtering fails
        candidateIds.push(...searchRes.labels.map(label => trackIdMap[label]).filter(id => id !== undefined && id !== trackId));
      }
    }

    // Get metadata for candidates to check folders
    const [candidatesMetadata] = await pool.query(`
      SELECT t.id, t.title, t.duration, art.name as artist_name, a.folder_path
      FROM tracks t
      JOIN albums a ON t.album_id = a.id
      JOIN artists art ON a.artist_id = art.id
      WHERE t.id IN (?)
    `, [candidateIds.slice(0, 50)]); // Limit to 50 for metadata query

    const candidatesMap = {};
    candidatesMetadata.forEach(c => { candidatesMap[c.id] = c; });

    // Get the folder of the seed track
    const [seedInfo] = await pool.query(`
      SELECT a.folder_path FROM tracks t JOIN albums a ON t.album_id = a.id WHERE t.id = ?
    `, [trackId]);
    const seedFolder = seedInfo.length > 0 ? seedInfo[0].folder_path : null;

    const resultTracks = [];
    const usedIds = new Set();
    let lastFolder = seedFolder;

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
        // Fallback: pick the most similar available even if folder matches
        for (const id of candidateIds) {
          if (!usedIds.has(id)) {
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

    res.json(resultTracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Generate an autogenerated playlist based on a random seed and similarity
app.get('/api/autogen-playlist', async (req, res) => {
  if (!faissIndex || trackIdMap.length === 0) {
    return res.status(503).json({ error: 'FAISS index not initialized or empty' });
  }

  try {
    // 1. Pick a random seed track from those that have vectors
    const seedTrackId = trackIdMap[Math.floor(Math.random() * trackIdMap.length)];

    // 2. Get the vector for the seed track
    const [seedRows] = await pool.query(`
      SELECT vector FROM track_vectors tv
      JOIN tracks t ON tv.file_path = t.file_path
      WHERE t.id = ?
    `, [seedTrackId]);

    if (seedRows.length === 0) {
      return res.status(404).json({ error: 'Seed track vector not found' });
    }

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
      py.on('close', (code) => {
        if (code === 0) resolve(stdoutData);
        else resolve(null);
      });
    });
    py.stdin.write(seedRows[0].vector);
    py.stdin.end();

    const resultOutput = await pyPromise;
    if (!resultOutput) return res.status(500).json({ error: 'Failed to decode seed vector' });

    const seedVec = JSON.parse(resultOutput);
    
    // 3. Search for 200 similar tracks to ensure variety after filtering
    const k = Math.min(200, faissIndex.ntotal());
    const searchRes = faissIndex.search(seedVec, k);
    
    const excludedIds = await getExcludedTrackIds();
    let candidateIds = searchRes.labels
      .map(label => trackIdMap[label])
      .filter(id => id !== undefined && !excludedIds.has(id));

    if (candidateIds.length < 20) {
      // Relax constraints if not enough candidates
      const [queued] = await pool.query('SELECT track_id FROM play_queue');
      const queuedIds = new Set(queued.map(r => r.track_id));
      candidateIds = searchRes.labels
        .map(label => trackIdMap[label])
        .filter(id => id !== undefined && !queuedIds.has(id));
      
      if (candidateIds.length < 20) {
        candidateIds = searchRes.labels.map(label => trackIdMap[label]).filter(id => id !== undefined);
      }
    }

    // 4. Fetch metadata for candidates to check folders
    const [candidatesMetadata] = await pool.query(`
      SELECT t.id, t.title, t.duration, art.name as artist_name, a.folder_path
      FROM tracks t
      JOIN albums a ON t.album_id = a.id
      JOIN artists art ON a.artist_id = art.id
      WHERE t.id IN (?)
    `, [candidateIds.slice(0, 100)]); // Process top 100 metadata

    // Map candidates for easy lookup
    const candidatesMap = {};
    candidatesMetadata.forEach(c => { candidatesMap[c.id] = c; });

    // 5. Select 20 tracks ensuring no consecutive same folder
    const resultTracks = [];
    const usedIds = new Set();
    
    // Start with the seed if it's available and not excluded
    let current = candidatesMap[seedTrackId];
    if (current && !excludedIds.has(seedTrackId)) {
      resultTracks.push(current);
      usedIds.add(current.id);
    }

    while (resultTracks.length < 20 && usedIds.size < candidateIds.length) {
      const prevFolder = resultTracks.length > 0 ? resultTracks[resultTracks.length - 1].folder_path : null;
      
      let nextTrack = null;
      // Find the most similar (first in candidateIds) that satisfies constraints
      for (const id of candidateIds) {
        if (usedIds.has(id)) continue;
        const candidate = candidatesMap[id];
        if (!candidate) continue;

        if (candidate.folder_path !== prevFolder) {
          nextTrack = candidate;
          break;
        }
      }

      // Fallback: if no track from a different folder is found, pick the most similar available
      if (!nextTrack) {
        for (const id of candidateIds) {
          if (!usedIds.has(id)) {
            nextTrack = candidatesMap[id];
            if (nextTrack) break;
          }
        }
      }

      if (nextTrack) {
        resultTracks.push(nextTrack);
        usedIds.add(nextTrack.id);
      } else {
        break; // No more tracks available
      }
    }

    res.json(resultTracks);
  } catch (err) {
    console.error('Autogen error:', err);
    res.status(500).json({ error: err.message });
  }
});

const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running at:`);
  console.log(`- Local:   http://localhost:${PORT}`);
  console.log(`- Network: http://${localIP}:${PORT}`);
  
  initFaiss().then(() => {
    console.log('FAISS initialization complete.');
  });
});
