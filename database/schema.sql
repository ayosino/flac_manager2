-- ========================================================
-- FLAC Music Manager Database Schema (Optimized v2)
-- Default Charset: utf8mb4, Collation: utf8mb4_unicode_ci
-- ========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Artists Table
CREATE TABLE IF NOT EXISTS artists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    name_reading VARCHAR(255),
    UNIQUE KEY uk_artist_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Albums Table
CREATE TABLE IF NOT EXISTS albums (
    id INT AUTO_INCREMENT PRIMARY KEY,
    artist_id INT,
    title VARCHAR(255) NOT NULL,
    year INT,
    cover_url VARCHAR(255),
    folder_path VARCHAR(512),
    mtime DATETIME,
    title_reading VARCHAR(255),
    manual_genre VARCHAR(100),
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_album_artist (artist_id),
    INDEX idx_album_mtime (mtime),
    INDEX idx_album_added_at (added_at),
    INDEX idx_album_folder (folder_path(255)),
    UNIQUE KEY uk_artist_album (artist_id, title),
    CONSTRAINT fk_albums_artist FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tracks Table
CREATE TABLE IF NOT EXISTS tracks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    album_id INT,
    title VARCHAR(255) NOT NULL,
    track_number INT,
    disc_number INT DEFAULT 1,
    duration INT DEFAULT 0,
    file_path VARCHAR(512) NOT NULL,
    mtime DATETIME,
    title_reading VARCHAR(255),
    bpm FLOAT,
    musical_key VARCHAR(20),
    genre VARCHAR(100),
    mood VARCHAR(100),
    country VARCHAR(100),
    manual_genre VARCHAR(100),
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_track_file_path (file_path),
    INDEX idx_track_album_disc_no (album_id, disc_number, track_number),
    INDEX idx_track_mtime (mtime),
    INDEX idx_track_added_at (added_at),
    CONSTRAINT fk_tracks_album FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Play Queue Table
CREATE TABLE IF NOT EXISTS play_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    track_id INT NOT NULL,
    sort_order INT NOT NULL,
    INDEX idx_queue_sort (sort_order),
    CONSTRAINT fk_queue_track FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Playback State Table (Singleton: id = 1)
CREATE TABLE IF NOT EXISTS playback_state (
    id INT PRIMARY KEY,
    current_queue_id INT NULL,
    seek_position FLOAT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_state_queue FOREIGN KEY (current_queue_id) REFERENCES play_queue(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ensure row id=1 exists
INSERT IGNORE INTO playback_state (id, current_queue_id, seek_position) VALUES (1, NULL, 0);

-- 6. Playback History Table
CREATE TABLE IF NOT EXISTS playback_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    track_id INT NOT NULL,
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_history_track (track_id),
    INDEX idx_history_played_at (played_at),
    CONSTRAINT fk_history_track FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Playlists Table
CREATE TABLE IF NOT EXISTS playlists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Playlist Tracks Table
CREATE TABLE IF NOT EXISTS playlist_tracks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    playlist_id INT NOT NULL,
    track_id INT NOT NULL,
    sort_order INT NOT NULL,
    INDEX idx_pt_playlist_sort (playlist_id, sort_order),
    CONSTRAINT fk_pt_playlist FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    CONSTRAINT fk_pt_track FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Track Vectors Table (FAISS / ML Audio Features)
CREATE TABLE IF NOT EXISTS track_vectors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_path VARCHAR(512) UNIQUE,
    vector LONGBLOB,
    INDEX idx_tv_file (file_path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
