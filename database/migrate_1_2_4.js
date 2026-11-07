require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const mm = require('music-metadata');
const kuromoji = require('kuromoji');

function initTokenizer() {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: 'node_modules/kuromoji/dict' }).build((err, _tokenizer) => {
      if (err) return reject(err);
      resolve(_tokenizer);
    });
  });
}

function getReading(tokenizer, text) {
  if (!text || !tokenizer) return '';
  const tokens = tokenizer.tokenize(text);
  return tokens.map(t => t.reading || t.surface_form).join('');
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) as c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].c > 0;
}

async function indexExists(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) as c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return rows[0].c > 0;
}

async function fkExists(conn, table, fkName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) as c FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [table, fkName]
  );
  return rows[0].c > 0;
}

async function ensureIndex(conn, table, indexName, columnsSql, unique = false) {
  if (!(await indexExists(conn, table, indexName))) {
    const kind = unique ? 'UNIQUE INDEX' : 'INDEX';
    console.log(`  + Adding ${kind} ${indexName} on ${table}(${columnsSql})`);
    await conn.query(`ALTER TABLE \`${table}\` ADD ${kind} \`${indexName}\` (${columnsSql})`);
  }
}

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  console.log('=== Starting Migration 1, 2, 4 ===');
  const tokenizer = await initTokenizer();

  try {
    // ----------------------------------------------------------------
    // PHASE 1: Add new columns to `tracks` (Items 1 & 2)
    // ----------------------------------------------------------------
    console.log('\n[Phase 1] Extending `tracks` table columns...');
    if (!(await columnExists(conn, 'tracks', 'disc_number'))) {
      console.log('  + Adding tracks.disc_number INT DEFAULT 1');
      await conn.query('ALTER TABLE tracks ADD COLUMN disc_number INT DEFAULT 1 AFTER track_number');
    }
    if (!(await columnExists(conn, 'tracks', 'artist_id'))) {
      console.log('  + Adding tracks.artist_id INT DEFAULT NULL');
      await conn.query('ALTER TABLE tracks ADD COLUMN artist_id INT DEFAULT NULL AFTER album_id');
    }
    if (!(await columnExists(conn, 'tracks', 'track_artist'))) {
      console.log('  + Adding tracks.track_artist VARCHAR(255) DEFAULT NULL');
      await conn.query('ALTER TABLE tracks ADD COLUMN track_artist VARCHAR(255) DEFAULT NULL AFTER artist_id');
    }
    if (!(await columnExists(conn, 'tracks', 'track_artist_reading'))) {
      console.log('  + Adding tracks.track_artist_reading VARCHAR(255) DEFAULT NULL');
      await conn.query('ALTER TABLE tracks ADD COLUMN track_artist_reading VARCHAR(255) DEFAULT NULL AFTER track_artist');
    }

    // Backfill tracks.artist_id, track_artist, track_artist_reading from current album artist
    console.log('  + Backfilling initial track artist data from album artist...');
    await conn.query(`
      UPDATE tracks t
      JOIN albums a ON t.album_id = a.id
      JOIN artists ar ON a.artist_id = ar.id
      SET t.artist_id = ar.id,
          t.track_artist = ar.name,
          t.track_artist_reading = ar.name_reading
      WHERE t.track_artist IS NULL
    `);

    // ----------------------------------------------------------------
    // PHASE 2: Drop legacy UNIQUE KEY (artist_id, title) on `albums`
    // ----------------------------------------------------------------
    console.log('\n[Phase 2] Updating `albums` unique constraint...');
    // Ensure artist_id index exists before dropping composite unique key used by FK
    await ensureIndex(conn, 'albums', 'idx_album_artist', 'artist_id');
    if (await indexExists(conn, 'albums', 'artist_id')) {
      console.log('  - Dropping legacy UNIQUE KEY `artist_id` (artist_id, title) from albums');
      await conn.query('ALTER TABLE albums DROP INDEX `artist_id`');
    }
    if (await indexExists(conn, 'albums', 'uk_artist_album')) {
      console.log('  - Dropping legacy UNIQUE KEY `uk_artist_album` (artist_id, title) from albums');
      await conn.query('ALTER TABLE albums DROP INDEX `uk_artist_album`');
    }

    // Helper to get or create artist
    const artistCache = new Map();
    const [allArtists] = await conn.query('SELECT id, name FROM artists');
    for (const ar of allArtists) artistCache.set(ar.name.toLowerCase(), ar.id);

    async function getOrCreateArtist(name) {
      const cleanName = (name || 'Unknown Artist').trim();
      const key = cleanName.toLowerCase();
      if (artistCache.has(key)) return artistCache.get(key);
      const reading = getReading(tokenizer, cleanName);
      const [res] = await conn.query(
        'INSERT INTO artists (name, name_reading) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
        [cleanName, reading]
      );
      artistCache.set(key, res.insertId);
      return res.insertId;
    }

    // ----------------------------------------------------------------
    // PHASE 3: Consolidate fragmented compilation folders (20 folders)
    // ----------------------------------------------------------------
    console.log('\n[Phase 3] Consolidating fragmented compilation folders...');
    const [dupFolders] = await conn.query(`
      SELECT folder_path, COUNT(*) as c
      FROM albums
      WHERE folder_path IS NOT NULL
      GROUP BY folder_path
      HAVING c > 1
    `);
    console.log(`  Found ${dupFolders.length} folders with fragmented album rows.`);

    for (const df of dupFolders) {
      const folderPath = df.folder_path;
      const [albRows] = await conn.query(
        'SELECT * FROM albums WHERE folder_path = ? ORDER BY id ASC',
        [folderPath]
      );
      if (albRows.length <= 1) continue;

      // Determine album artist from folder structure: /mnt/y/<Genre>/<Artist>/<Album>
      const parts = folderPath.split('/').filter(Boolean);
      // e.g. ['mnt', 'y', 'MISC', 'Various Artists', 'Places for Peace']
      let folderArtistName = parts.length >= 4 ? parts[3] : 'Various Artists';
      const targetArtistId = await getOrCreateArtist(folderArtistName);

      const keepAlbum = albRows[0];
      const removeAlbumIds = albRows.slice(1).map(r => r.id);

      // Pick first non-null cover_url or year if keepAlbum lacks them
      const bestCover = albRows.find(r => r.cover_url)?.cover_url || keepAlbum.cover_url;
      const bestYear = albRows.find(r => r.year)?.year || keepAlbum.year;

      await conn.query(
        'UPDATE albums SET artist_id = ?, cover_url = ?, year = ? WHERE id = ?',
        [targetArtistId, bestCover, bestYear, keepAlbum.id]
      );

      await conn.query(
        'UPDATE tracks SET album_id = ? WHERE album_id IN (?)',
        [keepAlbum.id, removeAlbumIds]
      );

      await conn.query('DELETE FROM albums WHERE id IN (?)', [removeAlbumIds]);
      console.log(`  ✓ Consolidated ${albRows.length} rows into album #${keepAlbum.id} (${folderArtistName} - ${keepAlbum.title})`);
    }

    // ----------------------------------------------------------------
    // PHASE 4: Split multi-directory merged albums (9 albums)
    // ----------------------------------------------------------------
    console.log('\n[Phase 4] Splitting tracks merged across different directories...');
    const [multiDirAlbums] = await conn.query(`
      SELECT a.id, a.artist_id, ar.name as artist_name, a.title, a.year, a.cover_url, a.folder_path, a.mtime, a.title_reading, a.manual_genre,
             COUNT(DISTINCT SUBSTRING(t.file_path, 1, CHAR_LENGTH(t.file_path) - LOCATE('/', REVERSE(t.file_path)))) as dir_cnt
      FROM albums a
      LEFT JOIN artists ar ON a.artist_id = ar.id
      JOIN tracks t ON t.album_id = a.id
      GROUP BY a.id
      HAVING dir_cnt > 1
    `);
    console.log(`  Found ${multiDirAlbums.length} albums spanning multiple directories.`);

    for (const album of multiDirAlbums) {
      const [tracks] = await conn.query('SELECT id, title, file_path, mtime FROM tracks WHERE album_id = ?', [album.id]);
      const byDir = new Map();
      for (const t of tracks) {
        const dir = path.dirname(t.file_path);
        if (!byDir.has(dir)) byDir.set(dir, []);
        byDir.get(dir).push(t);
      }

      for (const [dir, dirTracks] of byDir.entries()) {
        if (dir === album.folder_path) {
          // If this is the Unknown Album (#684) primary dir, fix its title/artist from path!
          if (album.title === 'Unknown Album') {
            const parts = dir.split('/').filter(Boolean);
            const inferredGenre = parts[2] || album.manual_genre;
            const inferredArtist = parts.length >= 5 ? parts[3] : parts[parts.length - 2] || 'Unknown Artist';
            const inferredAlbum = parts[parts.length - 1] || 'Unknown Album';
            const newArtistId = await getOrCreateArtist(inferredArtist);
            const artistReading = getReading(tokenizer, inferredArtist);
            const albumReading = getReading(tokenizer, inferredAlbum);
            await conn.query(
              'UPDATE albums SET artist_id = ?, title = ?, title_reading = ?, manual_genre = ? WHERE id = ?',
              [newArtistId, inferredAlbum, albumReading, inferredGenre, album.id]
            );
            await conn.query(
              'UPDATE tracks SET artist_id = ?, track_artist = ?, track_artist_reading = ?, manual_genre = ? WHERE album_id = ?',
              [newArtistId, inferredArtist, artistReading, inferredGenre, album.id]
            );
            console.log(`  ✓ Renamed Unknown Album #${album.id} in ${dir} -> ${inferredArtist} - ${inferredAlbum}`);
          }
          continue;
        }

        // Check if an album already exists for `dir`
        const [existing] = await conn.query('SELECT id, artist_id FROM albums WHERE folder_path = ? LIMIT 1', [dir]);
        let targetAlbumId;
        let targetArtistId;
        let targetArtistName;

        const parts = dir.split('/').filter(Boolean);
        const inferredGenre = parts[2] || album.manual_genre;

        if (existing.length > 0) {
          targetAlbumId = existing[0].id;
          targetArtistId = existing[0].artist_id;
          const [arRow] = await conn.query('SELECT name FROM artists WHERE id = ?', [targetArtistId]);
          targetArtistName = arRow[0]?.name || album.artist_name;
          console.log(`  ✓ Moving ${dirTracks.length} tracks in ${dir} -> existing album #${targetAlbumId}`);
        } else {
          // Determine artist and album title for the new split album
          let newAlbumTitle = album.title;
          targetArtistName = album.artist_name;
          if (album.title === 'Unknown Album') {
            if (parts.length >= 5) {
              targetArtistName = parts[3];
              newAlbumTitle = parts.slice(4).join(' / ');
            } else {
              targetArtistName = parts[parts.length - 1];
              newAlbumTitle = parts[parts.length - 1];
            }
          } else {
            // Use folder basename if it differs (e.g. Disc2, Disc3, 紙ジャケ, The Collection Disc 3)
            const folderBase = path.basename(dir);
            if (folderBase !== album.title) {
              newAlbumTitle = folderBase;
            }
          }
          targetArtistId = await getOrCreateArtist(targetArtistName);
          const albumReading = getReading(tokenizer, newAlbumTitle);
          const mtime = dirTracks[0].mtime || album.mtime;

          const [ins] = await conn.query(
            `INSERT INTO albums (artist_id, title, year, cover_url, folder_path, mtime, title_reading, manual_genre, added_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [targetArtistId, newAlbumTitle, album.year, album.cover_url, dir, mtime, albumReading, inferredGenre]
          );
          targetAlbumId = ins.insertId;
          console.log(`  ✓ Created split album #${targetAlbumId} (${targetArtistName} - ${newAlbumTitle}) for ${dir}`);
        }

        const trackIds = dirTracks.map(t => t.id);
        const artistReading = getReading(tokenizer, targetArtistName);
        await conn.query(
          'UPDATE tracks SET album_id = ?, artist_id = ?, track_artist = ?, track_artist_reading = ?, manual_genre = ? WHERE id IN (?)',
          [targetAlbumId, targetArtistId, targetArtistName, artistReading, inferredGenre, trackIds]
        );
      }
    }

    // ----------------------------------------------------------------
    // PHASE 5: Populate `disc_number` & `track_artist` from FLAC tags
    // ----------------------------------------------------------------
    console.log('\n[Phase 5] Extracting disc_number and compilation track_artist from FLAC metadata...');

    // 5A. Multi-disc albums (albums that have duplicate track_number)
    const [dupTrackAlbums] = await conn.query(`
      SELECT DISTINCT album_id
      FROM (
        SELECT album_id, track_number, COUNT(*) as cnt
        FROM tracks
        WHERE track_number IS NOT NULL
        GROUP BY album_id, track_number
        HAVING cnt > 1
      ) sub
    `);
    const multiDiscAlbumIds = dupTrackAlbums.map(r => r.album_id);
    console.log(`  Found ${multiDiscAlbumIds.length} single-folder multi-disc albums with duplicate track numbers.`);

    for (const albumId of multiDiscAlbumIds) {
      const [tracks] = await conn.query(
        'SELECT id, title, track_number, file_path FROM tracks WHERE album_id = ? ORDER BY file_path ASC',
        [albumId]
      );
      let inferredDisc = 1;
      let prevTrackNo = 0;
      for (const t of tracks) {
        let tagDisc = null;
        try {
          if (fs.existsSync(t.file_path)) {
            const meta = await mm.parseFile(t.file_path, { skipCovers: true, duration: false });
            tagDisc = meta.common?.disk?.no || null;
          }
        } catch (e) {
          // ignore read error
        }
        if (!tagDisc) {
          // Check filename pattern e.g. 1-01, 2-01, Disc 2
          const base = path.basename(t.file_path);
          const m = base.match(/^(\d+)[-_]\d+/);
          if (m) {
            tagDisc = parseInt(m[1], 10);
          } else if (t.track_number !== null && t.track_number <= prevTrackNo) {
            inferredDisc++;
            tagDisc = inferredDisc;
          } else {
            tagDisc = inferredDisc;
          }
        }
        if (t.track_number !== null) prevTrackNo = t.track_number;
        await conn.query('UPDATE tracks SET disc_number = ? WHERE id = ?', [tagDisc || 1, t.id]);
      }
    }

    // 5B. Various Artists compilation tracks -> extract real track artist
    const [vaTracks] = await conn.query(`
      SELECT t.id, t.title, t.file_path, t.track_artist
      FROM tracks t
      JOIN albums a ON t.album_id = a.id
      JOIN artists ar ON a.artist_id = ar.id
      WHERE ar.name = 'Various Artists' AND t.track_artist = 'Various Artists'
    `);
    console.log(`  Scanning ${vaTracks.length} tracks in 'Various Artists' albums (concurrency=16)...`);

    const CONCURRENCY = 16;
    let updatedVaCount = 0;
    for (let i = 0; i < vaTracks.length; i += CONCURRENCY) {
      const batch = vaTracks.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (t) => {
        let trackArtist = null;
        let discNo = null;
        try {
          if (fs.existsSync(t.file_path)) {
            const meta = await mm.parseFile(t.file_path, { skipCovers: true, duration: false });
            if (meta.common?.artist && meta.common.artist.trim() !== '' && meta.common.artist.trim() !== 'Various Artists') {
              trackArtist = meta.common.artist.trim();
            }
            if (meta.common?.disk?.no) {
              discNo = meta.common.disk.no;
            }
          }
        } catch (e) {
          // ignore
        }

        // Fallback: if tag artist was 'Various Artists', check if title or filename has "Artist - Title"
        if (!trackArtist) {
          const titleMatch = t.title.match(/^(.+?)\s+-\s+(.+)$/);
          if (titleMatch) {
            trackArtist = titleMatch[1].trim();
          } else {
            const base = path.basename(t.file_path, path.extname(t.file_path));
            const fileMatch = base.match(/^\d+[-_.\s]+(.+?)\s+-\s+(.+)$/);
            if (fileMatch) {
              trackArtist = fileMatch[1].trim();
            }
          }
        }

        if (trackArtist && trackArtist !== 'Various Artists') {
          const artId = await getOrCreateArtist(trackArtist);
          const reading = getReading(tokenizer, trackArtist);
          await conn.query(
            'UPDATE tracks SET artist_id = ?, track_artist = ?, track_artist_reading = ?, disc_number = COALESCE(?, disc_number) WHERE id = ?',
            [artId, trackArtist, reading, discNo, t.id]
          );
          updatedVaCount++;
        } else if (discNo) {
          await conn.query('UPDATE tracks SET disc_number = ? WHERE id = ?', [discNo, t.id]);
        }
      }));
      if ((i + CONCURRENCY) % 500 === 0 || i + CONCURRENCY >= vaTracks.length) {
        console.log(`    Processed ${Math.min(i + CONCURRENCY, vaTracks.length)} / ${vaTracks.length} (resolved ${updatedVaCount} track artists)`);
      }
    }

    // ----------------------------------------------------------------
    // PHASE 6: Indexes, Foreign Keys (ON DELETE CASCADE), Cleanup (Item 4)
    // ----------------------------------------------------------------
    console.log('\n[Phase 6] Applying indexes, foreign keys, and cleanup (Item 4)...');

    // Albums indexes
    await ensureIndex(conn, 'albums', 'uk_album_folder', 'folder_path(255)', true);
    await ensureIndex(conn, 'albums', 'idx_album_mtime', 'mtime');
    await ensureIndex(conn, 'albums', 'idx_album_added_at', 'added_at');
    await ensureIndex(conn, 'albums', 'idx_album_manual_genre', 'manual_genre');
    await ensureIndex(conn, 'albums', 'idx_album_title_reading', 'title_reading');

    // Tracks indexes
    await ensureIndex(conn, 'tracks', 'idx_track_album_disc_no', 'album_id, disc_number, track_number');
    await ensureIndex(conn, 'tracks', 'idx_track_artist', 'artist_id');
    await ensureIndex(conn, 'tracks', 'idx_track_mtime', 'mtime');
    await ensureIndex(conn, 'tracks', 'idx_track_added_at', 'added_at');
    await ensureIndex(conn, 'tracks', 'idx_track_title_reading', 'title_reading');
    await ensureIndex(conn, 'tracks', 'idx_track_manual_genre', 'manual_genre');

    // Queue, History, Playlist Tracks indexes
    await ensureIndex(conn, 'play_queue', 'idx_queue_sort', 'sort_order');
    await ensureIndex(conn, 'playback_history', 'idx_history_played_at', 'played_at');
    await ensureIndex(conn, 'playlist_tracks', 'idx_pt_playlist_sort', 'playlist_id, sort_order');

    // Update Foreign Keys for ON DELETE CASCADE / SET NULL
    if (await fkExists(conn, 'albums', 'albums_ibfk_1')) {
      console.log('  + Updating albums_ibfk_1 to ON DELETE SET NULL');
      await conn.query('ALTER TABLE albums DROP FOREIGN KEY albums_ibfk_1');
      await conn.query('ALTER TABLE albums ADD CONSTRAINT fk_albums_artist FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL');
    }
    if (await fkExists(conn, 'tracks', 'tracks_ibfk_1')) {
      console.log('  + Updating tracks_ibfk_1 to ON DELETE CASCADE');
      await conn.query('ALTER TABLE tracks DROP FOREIGN KEY tracks_ibfk_1');
      await conn.query('ALTER TABLE tracks ADD CONSTRAINT fk_tracks_album FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE');
    }
    if (!(await fkExists(conn, 'tracks', 'fk_tracks_artist'))) {
      console.log('  + Adding fk_tracks_artist (tracks.artist_id -> artists.id ON DELETE SET NULL)');
      await conn.query('ALTER TABLE tracks ADD CONSTRAINT fk_tracks_artist FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL');
    }

    // Drop legacy migration backup tables
    const backupTables = ['_backup_misc_migration_albums', '_backup_misc_migration_tracks', '_backup_misc_migration_vectors'];
    for (const bt of backupTables) {
      console.log(`  - Dropping legacy backup table if exists: ${bt}`);
      await conn.query(`DROP TABLE IF EXISTS \`${bt}\``);
    }

    // Delete orphaned artists not referenced by any album OR any track
    const [delArtists] = await conn.query(`
      DELETE FROM artists
      WHERE id NOT IN (SELECT DISTINCT artist_id FROM albums WHERE artist_id IS NOT NULL)
        AND id NOT IN (SELECT DISTINCT artist_id FROM tracks WHERE artist_id IS NOT NULL)
    `);
    console.log(`  - Cleaned up ${delArtists.affectedRows} orphaned artists.`);

    console.log('\n=== Migration 1, 2, 4 Completed Successfully! ===');
  } finally {
    await conn.end();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
