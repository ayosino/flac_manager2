const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

// GET /api/queue - Fetch persistent play queue
router.get('/queue', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT q.id as queue_id, t.id, t.album_id, t.title, t.duration,
              COALESCE(t.track_artist, art.name) as artist_name,
              a.title as album_title, a.cover_url
       FROM play_queue q
       JOIN tracks t ON q.track_id = t.id
       JOIN albums a ON t.album_id = a.id
       JOIN artists art ON a.artist_id = art.id
       ORDER BY q.sort_order ASC, q.id ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue - Add tracks to persistent play queue
router.post('/queue', async (req, res) => {
  try {
    const { trackIds } = req.body;
    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return res.status(400).json({ error: 'trackIds array is required' });
    }

    const [maxRows] = await pool.query('SELECT MAX(sort_order) as max_so FROM play_queue');
    let nextOrder = (maxRows[0].max_so || 0) + 1;

    const values = trackIds.map(id => [id, nextOrder++]);
    await pool.query('INSERT INTO play_queue (track_id, sort_order) VALUES ?', [values]);

    res.json({ success: true, added: trackIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/queue/:id - Remove single item from queue
router.delete('/queue/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM play_queue WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue/clear - Clear entire queue
router.post('/queue/clear', async (req, res) => {
  try {
    await pool.query('DELETE FROM play_queue');
    await pool.query('UPDATE playback_state SET current_queue_id = NULL, seek_position = 0 WHERE id = 1');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/playback-state - Fetch saved playback state
router.get('/playback-state', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT current_queue_id, seek_position FROM playback_state WHERE id = 1');
    res.json(rows[0] || { current_queue_id: null, seek_position: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/playback-state - Save playback state
router.post('/playback-state', async (req, res) => {
  try {
    const { current_queue_id, seek_position } = req.body;
    await pool.query(
      'UPDATE playback_state SET current_queue_id = ?, seek_position = ? WHERE id = 1',
      [current_queue_id || null, seek_position || 0]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/history - Recent playback history
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const [rows] = await pool.query(
      `SELECT h.id as history_id, h.played_at, t.id, t.id as track_id, t.album_id, t.title, t.duration,
              COALESCE(t.track_artist, art.name) as artist_name,
              a.title as album_title, a.cover_url
       FROM playback_history h
       JOIN tracks t ON h.track_id = t.id
       JOIN albums a ON t.album_id = a.id
       JOIN artists art ON a.artist_id = art.id
       ORDER BY h.played_at DESC
       LIMIT ?`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/history - Record completed track playback
router.post('/history', async (req, res) => {
  try {
    const { trackId } = req.body;
    if (!trackId) return res.status(400).json({ error: 'trackId is required' });
    await pool.query('INSERT INTO playback_history (track_id) VALUES (?)', [trackId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
