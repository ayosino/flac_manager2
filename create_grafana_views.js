require('dotenv').config();
const mysql = require('mysql2/promise');

async function createViews() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  try {
    console.log('Creating Grafana views (v_grafana_*)...');

    // 1. v_grafana_artists
    await connection.query(`
      CREATE OR REPLACE VIEW v_grafana_artists AS
      SELECT 
        id AS artist_id,
        name AS artist_name,
        name_reading
      FROM artists
    `);
    console.log('✓ Created v_grafana_artists');

    // 2. v_grafana_albums
    await connection.query(`
      CREATE OR REPLACE VIEW v_grafana_albums AS
      SELECT 
        al.id AS album_id,
        al.artist_id,
        ar.name AS artist_name,
        al.title AS album_title,
        al.year AS release_year,
        al.cover_url,
        al.folder_path,
        al.mtime,
        al.title_reading,
        al.added_at AS time
      FROM albums al
      LEFT JOIN artists ar ON al.artist_id = ar.id
    `);
    console.log('✓ Created v_grafana_albums');

    // 3. v_grafana_tracks
    await connection.query(`
      CREATE OR REPLACE VIEW v_grafana_tracks AS
      SELECT 
        t.id AS track_id,
        t.album_id,
        al.artist_id,
        ar.name AS artist_name,
        al.title AS album_title,
        t.title AS track_title,
        t.track_number,
        t.duration AS duration_seconds,
        t.file_path,
        t.mtime,
        t.title_reading,
        t.added_at AS time
      FROM tracks t
      LEFT JOIN albums al ON t.album_id = al.id
      LEFT JOIN artists ar ON al.artist_id = ar.id
    `);
    console.log('✓ Created v_grafana_tracks');

    // 4. v_grafana_playback_history
    await connection.query(`
      CREATE OR REPLACE VIEW v_grafana_playback_history AS
      SELECT 
        ph.id AS history_id,
        ph.played_at AS time,
        ph.track_id,
        t.title AS track_title,
        ar.name AS artist_name,
        al.title AS album_title,
        t.duration AS duration_seconds
      FROM playback_history ph
      LEFT JOIN tracks t ON ph.track_id = t.id
      LEFT JOIN albums al ON t.album_id = al.id
      LEFT JOIN artists ar ON al.artist_id = ar.id
    `);
    console.log('✓ Created v_grafana_playback_history');

    // 5. v_grafana_playlists
    await connection.query(`
      CREATE OR REPLACE VIEW v_grafana_playlists AS
      SELECT 
        id AS playlist_id,
        name AS playlist_name,
        created_at AS time
      FROM playlists
    `);
    console.log('✓ Created v_grafana_playlists');

    // 6. v_grafana_playlist_tracks
    await connection.query(`
      CREATE OR REPLACE VIEW v_grafana_playlist_tracks AS
      SELECT 
        pt.id AS playlist_track_id,
        pt.playlist_id,
        p.name AS playlist_name,
        pt.track_id,
        t.title AS track_title,
        ar.name AS artist_name,
        pt.sort_order
      FROM playlist_tracks pt
      LEFT JOIN playlists p ON pt.playlist_id = p.id
      LEFT JOIN tracks t ON pt.track_id = t.id
      LEFT JOIN albums al ON t.album_id = al.id
      LEFT JOIN artists ar ON al.artist_id = ar.id
    `);
    console.log('✓ Created v_grafana_playlist_tracks');

    // 7. v_grafana_play_queue
    await connection.query(`
      CREATE OR REPLACE VIEW v_grafana_play_queue AS
      SELECT 
        pq.id AS queue_id,
        pq.track_id,
        t.title AS track_title,
        ar.name AS artist_name,
        al.title AS album_title,
        t.duration AS duration_seconds,
        pq.sort_order
      FROM play_queue pq
      LEFT JOIN tracks t ON pq.track_id = t.id
      LEFT JOIN albums al ON t.album_id = al.id
      LEFT JOIN artists ar ON al.artist_id = ar.id
    `);
    console.log('✓ Created v_grafana_play_queue');

    // 8. v_grafana_track_vectors (存在する場合のみ作成、失敗しても続行)
    try {
      await connection.query(`
        CREATE OR REPLACE VIEW v_grafana_track_vectors AS
        SELECT 
          tv.id AS vector_id,
          tv.file_path,
          t.id AS track_id,
          t.title AS track_title
        FROM track_vectors tv
        LEFT JOIN tracks t ON tv.file_path = t.file_path
      `);
      console.log('✓ Created v_grafana_track_vectors');
    } catch (err) {
      console.log('ⓘ Skipped v_grafana_track_vectors (table might not exist yet)');
    }

    console.log('All Grafana views created successfully!');
  } catch (err) {
    console.error('Error creating views:', err.message);
  } finally {
    await connection.end();
  }
}

createViews();
