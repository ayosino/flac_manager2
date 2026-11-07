const express = require('express');
const fs = require('fs');
const path = require('path');
const wanakana = require('wanakana');
const { pool, EXCLUDE_DIRS, getExcludeClause, getExcludeParams } = require('../config/db');

const router = express.Router();

// GET /api/albums - Paginated, searchable, sortable album list
router.get('/albums', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const search = (req.query.search || '').trim();
    const sort = req.query.sort || 'alpha';
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];

    whereClause += getExcludeClause('a');
    params.push(...getExcludeParams());

    if (search) {
      const searchKana = wanakana.toKatakana(search);
      whereClause += ` AND (
        a.title LIKE ?
        OR art.name LIKE ?
        OR a.folder_path LIKE ?
        OR a.manual_genre LIKE ?
        OR a.title_reading LIKE ?
        OR art.name_reading LIKE ?
      )`;
      const p = `%${search}%`;
      const pk = `%${searchKana}%`;
      params.push(p, p, p, p, pk, pk);
    }

    const [totalRows] = await pool.query(
      `SELECT COUNT(*) as count FROM albums a JOIN artists art ON a.artist_id = art.id ${whereClause}`,
      params
    );

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
      orderBy = 'art.name ASC, a.title ASC';
    }

    const [rows] = await pool.query(
      `SELECT a.id, a.artist_id, a.title, a.year, a.cover_url, a.folder_path, a.manual_genre, a.mtime, a.added_at,
              art.name as artist_name
       FROM albums a
       JOIN artists art ON a.artist_id = art.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

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

// GET /api/albums/:id - Single album detail
router.get('/albums/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.artist_id, a.title, a.year, a.cover_url, a.folder_path, a.manual_genre, a.mtime, a.added_at,
              art.name as artist_name
       FROM albums a
       LEFT JOIN artists art ON a.artist_id = art.id
       WHERE a.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Album not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/albums/:id/tracks - Tracks for an album
router.get('/albums/:id/tracks', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.album_id, t.artist_id, t.title, t.disc_number, t.track_number, t.duration,
              t.bpm, t.musical_key, t.genre, t.manual_genre,
              COALESCE(t.track_artist, art.name) as artist_name,
              a.title as album_title, a.cover_url
       FROM tracks t
       JOIN albums a ON t.album_id = a.id
       LEFT JOIN artists art ON a.artist_id = art.id
       WHERE t.album_id = ?
       ORDER BY t.disc_number ASC, t.track_number ASC, t.title ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/random - Random albums
router.get('/random', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    let whereClause = 'WHERE 1=1';
    const params = [];
    whereClause += getExcludeClause('a');
    params.push(...getExcludeParams());

    const [rows] = await pool.query(
      `SELECT a.id, a.artist_id, a.title, a.year, a.cover_url, a.folder_path, a.manual_genre, a.mtime, a.added_at,
              art.name as artist_name
       FROM albums a
       JOIN artists art ON a.artist_id = art.id
       ${whereClause}
       ORDER BY RAND()
       LIMIT ?`,
      [...params, limit]
    );

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

// GET /api/artists - Paginated, searchable, sortable artists
router.get('/artists', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const search = (req.query.search || '').trim();
    const sort = req.query.sort || 'alpha';
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (EXCLUDE_DIRS.length > 0) {
      whereClause += ` AND (
        EXISTS (SELECT 1 FROM albums alb WHERE alb.artist_id = artists.id ${getExcludeClause('alb')})
        OR EXISTS (SELECT 1 FROM tracks tr JOIN albums alb2 ON tr.album_id = alb2.id WHERE tr.artist_id = artists.id ${getExcludeClause('alb2')})
      )`;
      params.push(...getExcludeParams(), ...getExcludeParams());
    }

    if (search) {
      const searchKana = wanakana.toKatakana(search);
      whereClause += ` AND (
        artists.name LIKE ?
        OR artists.name_reading LIKE ?
        OR EXISTS (SELECT 1 FROM albums alb WHERE alb.artist_id = artists.id AND alb.folder_path LIKE ?)
      )`;
      const p = `%${search}%`;
      const pk = `%${searchKana}%`;
      params.push(p, pk, p);
    }

    const [totalRows] = await pool.query(`SELECT COUNT(*) as count FROM artists ${whereClause}`, params);

    let orderBy;
    if (sort === 'newest') {
      orderBy = '(SELECT MAX(mtime) FROM albums WHERE artist_id = artists.id) DESC, artists.id DESC';
    } else if (sort === 'added') {
      orderBy = '(SELECT MAX(added_at) FROM albums WHERE artist_id = artists.id) DESC, artists.id DESC';
    } else if (sort === 'id_desc' || sort === 'id') {
      orderBy = 'artists.id DESC';
    } else if (sort === 'id_asc') {
      orderBy = 'artists.id ASC';
    } else {
      orderBy = 'artists.name ASC';
    }

    const [rows] = await pool.query(
      `SELECT artists.id, artists.name,
              COALESCE(
                (SELECT folder_path FROM albums WHERE artist_id = artists.id LIMIT 1),
                (SELECT a.folder_path FROM tracks t JOIN albums a ON t.album_id = a.id WHERE t.artist_id = artists.id LIMIT 1)
              ) as folder_path,
              (SELECT COUNT(*) FROM albums WHERE artist_id = artists.id) as album_count
       FROM artists
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

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

// GET /api/artists/:id - Single artist info
router.get('/artists/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, name_reading FROM artists WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Artist not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/artists/:id/albums - Albums for an artist (including compilation appearances)
router.get('/artists/:id/albums', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT a.id, a.artist_id, a.title, a.year, a.cover_url, a.folder_path, a.manual_genre, a.mtime, a.added_at,
              art.name as artist_name
       FROM albums a
       JOIN artists art ON a.artist_id = art.id
       LEFT JOIN tracks t ON t.album_id = a.id
       WHERE a.artist_id = ? OR t.artist_id = ?
       ORDER BY a.year DESC, a.title ASC`,
      [req.params.id, req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/artists/:id/tracks - All tracks for an artist
router.get('/artists/:id/tracks', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.album_id, t.title, t.disc_number, t.track_number, t.duration,
              COALESCE(t.track_artist, art.name) as artist_name,
              a.title as album_title, a.cover_url
       FROM tracks t
       JOIN albums a ON t.album_id = a.id
       JOIN artists art ON a.artist_id = art.id
       WHERE a.artist_id = ? OR t.artist_id = ?
       ORDER BY a.year DESC, a.title ASC, t.disc_number ASC, t.track_number ASC, t.title ASC`,
      [req.params.id, req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/folders/browse - Hierarchical folder browser
router.get('/folders/browse', async (req, res) => {
  try {
    const parentPath = req.query.path || process.env.MUSIC_DIR;
    const prefix = parentPath.endsWith('/') ? parentPath : parentPath + '/';

    const [folderRows] = await pool.query(
      `SELECT DISTINCT SUBSTRING_INDEX(SUBSTRING(folder_path, ?), '/', 1) as name
       FROM albums
       WHERE folder_path LIKE ?
         AND folder_path != ?
         ${getExcludeClause('albums')}
       ORDER BY name ASC`,
      [prefix.length + 1, prefix + '%', parentPath, ...getExcludeParams()]
    );

    const folders = folderRows
      .map(r => r.name)
      .filter(name => name && name !== '')
      .filter(name => {
        const fullPath = path.join(parentPath, name);
        return !EXCLUDE_DIRS.some(exclude => fullPath === exclude);
      })
      .map(name => ({
        name,
        path: path.join(parentPath, name)
      }));

    const [albumRows] = await pool.query(
      `SELECT a.id, a.artist_id, a.title, a.year, a.cover_url, a.folder_path, a.manual_genre, a.mtime,
              art.name as artist_name
       FROM albums a
       JOIN artists art ON a.artist_id = art.id
       WHERE a.folder_path = ?
       ${getExcludeClause('a')}
       ORDER BY a.title ASC`,
      [parentPath, ...getExcludeParams()]
    );

    res.json({
      currentPath: parentPath,
      rootPath: process.env.MUSIC_DIR,
      folders,
      albums: albumRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/folders/albums
router.get('/folders/albums', async (req, res) => {
  try {
    const folderPath = req.query.path;
    const [rows] = await pool.query(
      `SELECT a.id, a.artist_id, a.title, a.year, a.cover_url, a.folder_path, a.manual_genre, a.mtime,
              art.name as artist_name
       FROM albums a
       JOIN artists art ON a.artist_id = art.id
       WHERE a.folder_path = ?
       ${getExcludeClause('a')}
       ORDER BY a.title ASC`,
      [folderPath, ...getExcludeParams()]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/folders/tracks - All tracks under a folder recursively
router.get('/folders/tracks', async (req, res) => {
  try {
    const folderPath = req.query.path;
    if (!folderPath) return res.status(400).json({ error: 'Path is required' });

    const [rows] = await pool.query(
      `SELECT t.id, t.album_id, t.title, t.disc_number, t.track_number, t.duration,
              COALESCE(t.track_artist, art.name) as artist_name,
              a.title as album_title, a.cover_url
       FROM tracks t
       JOIN albums a ON t.album_id = a.id
       JOIN artists art ON a.artist_id = art.id
       WHERE a.folder_path LIKE ?
       ${getExcludeClause('a')}
       ORDER BY a.folder_path ASC, a.title ASC, t.disc_number ASC, t.track_number ASC, t.title ASC`,
      [`${folderPath}%`, ...getExcludeParams()]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stream/:id - FLAC HTTP Range Streaming
router.get('/stream/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT file_path FROM tracks WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).send('Track not found');

    const filePath = rows[0].file_path;
    if (!fs.existsSync(filePath)) return res.status(404).send('Audio file missing on disk');

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/flac'
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'audio/flac'
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
