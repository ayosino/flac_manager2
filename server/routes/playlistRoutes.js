const express = require('express');
const { pool } = require('../config/db');
const { getRecommendations, generateAutogenPlaylist } = require('../services/faissService');

const router = express.Router();

// GET /api/playlists - List playlists with track counts
router.get('/playlists', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.created_at, COUNT(pt.id) as track_count
       FROM playlists p
       LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
       GROUP BY p.id
       ORDER BY p.name ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/playlists/:id - Single playlist metadata
router.get('/playlists/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.created_at, COUNT(pt.id) as track_count
       FROM playlists p
       LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
       WHERE p.id = ?
       GROUP BY p.id`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Playlist not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playlists - Create playlist
router.post('/playlists', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const [result] = await pool.query('INSERT INTO playlists (name) VALUES (?)', [name.trim()]);
    res.json({ id: result.insertId, name: name.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/playlists/:id - Delete playlist
router.delete('/playlists/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM playlists WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/playlists/:id/tracks - Tracks in playlist
router.get('/playlists/:id/tracks', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT pt.id as playlist_track_id, t.id, t.album_id, t.title, t.disc_number, t.track_number, t.duration,
              COALESCE(t.track_artist, art.name) as artist_name,
              a.title as album_title, a.cover_url
       FROM playlist_tracks pt
       JOIN tracks t ON pt.track_id = t.id
       JOIN albums a ON t.album_id = a.id
       JOIN artists art ON a.artist_id = art.id
       WHERE pt.playlist_id = ?
       ORDER BY pt.sort_order ASC, pt.id ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playlists/:id/tracks - Add tracks to playlist
router.post('/playlists/:id/tracks', async (req, res) => {
  try {
    const { trackIds } = req.body;
    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return res.status(400).json({ error: 'trackIds array is required' });
    }

    const [maxRows] = await pool.query(
      'SELECT MAX(sort_order) as max_so FROM playlist_tracks WHERE playlist_id = ?',
      [req.params.id]
    );
    let nextOrder = (maxRows[0].max_so || 0) + 1;

    const values = trackIds.map(trackId => [req.params.id, trackId, nextOrder++]);
    await pool.query('INSERT INTO playlist_tracks (playlist_id, track_id, sort_order) VALUES ?', [values]);

    res.json({ success: true, added: trackIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/playlists/:playlistId/tracks/:playlistTrackId - Remove track from playlist
router.delete('/playlists/:playlistId/tracks/:playlistTrackId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM playlist_tracks WHERE id = ? AND playlist_id = ?',
      [req.params.playlistTrackId, req.params.playlistId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recommendations/:trackId - FAISS similarity recommendations
router.get('/recommendations/:trackId', async (req, res) => {
  try {
    const trackId = parseInt(req.params.trackId, 10);
    const limit = parseInt(req.query.limit, 10) || 5;
    const tracks = await getRecommendations(trackId, limit);
    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/autogen-playlist - FAISS 20-track autogen playlist
router.get('/autogen-playlist', async (req, res) => {
  try {
    const tracks = await generateAutogenPlaylist(20);
    res.json(tracks);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
