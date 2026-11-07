-- ========================================================
-- Grafana Reporting Views (v_grafana_*)
-- ========================================================

CREATE OR REPLACE VIEW v_grafana_artists AS
SELECT 
    id AS artist_id,
    name AS artist_name,
    name_reading
FROM artists;

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
LEFT JOIN artists ar ON al.artist_id = ar.id;

CREATE OR REPLACE VIEW v_grafana_tracks AS
SELECT 
    t.id AS track_id,
    t.album_id,
    al.artist_id,
    ar.name AS artist_name,
    al.title AS album_title,
    t.title AS track_title,
    t.track_number,
    t.disc_number,
    t.duration AS duration_seconds,
    t.file_path,
    t.bpm,
    t.musical_key,
    t.genre,
    t.mood,
    t.country,
    t.mtime,
    t.title_reading,
    t.added_at AS time
FROM tracks t
LEFT JOIN albums al ON t.album_id = al.id
LEFT JOIN artists ar ON al.artist_id = ar.id;

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
LEFT JOIN artists ar ON al.artist_id = ar.id;

CREATE OR REPLACE VIEW v_grafana_playlists AS
SELECT 
    id AS playlist_id,
    name AS playlist_name,
    created_at AS time
FROM playlists;

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
LEFT JOIN artists ar ON al.artist_id = ar.id;

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
LEFT JOIN artists ar ON al.artist_id = ar.id;
