require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const mm = require('music-metadata');
const kuromoji = require('kuromoji');

const MUSIC_DIR = process.env.MUSIC_DIR;
const EXCLUDE_DIRS = process.env.EXCLUDE_DIRS
  ? process.env.EXCLUDE_DIRS.split(',').map(d => d.trim()).filter(Boolean)
  : [];
const COVERS_DIR = path.join(__dirname, '..', '..', 'public', 'covers');
const isFullScan = process.argv.includes('--full');

let tokenizer = null;

function initTokenizer() {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: path.join(__dirname, '..', '..', 'node_modules', 'kuromoji', 'dict') }).build((err, _tokenizer) => {
      if (err) return reject(err);
      tokenizer = _tokenizer;
      resolve();
    });
  });
}

function getReading(text) {
  if (!text || !tokenizer) return '';
  const tokens = tokenizer.tokenize(text);
  return tokens.map(t => t.reading || t.surface_form).join('');
}

async function scan() {
  if (!fs.existsSync(COVERS_DIR)) {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  console.log('Connected to MySQL. Initializing tokenizer...');
  await initTokenizer();

  const trackMap = new Map();
  if (!isFullScan) {
    console.log('Loading existing tracks for delta scan...');
    const [allTracks] = await connection.query('SELECT file_path, mtime FROM tracks');
    for (const t of allTracks) {
      if (t.file_path && t.mtime) {
        trackMap.set(t.file_path, new Date(t.mtime).getTime());
      }
    }
    console.log(`Loaded ${trackMap.size} tracks from database.`);
  }

  async function getOrCreateArtist(name, reading) {
    const [artists] = await connection.query('SELECT id FROM artists WHERE name = ?', [name]);
    if (artists.length === 0) {
      const [result] = await connection.query(
        'INSERT INTO artists (name, name_reading) VALUES (?, ?)',
        [name, reading]
      );
      return result.insertId;
    }
    const artistId = artists[0].id;
    await connection.query('UPDATE artists SET name_reading = ? WHERE id = ?', [reading, artistId]);
    return artistId;
  }

  async function walk(dir) {
    if (EXCLUDE_DIRS.some(exclude => dir.startsWith(exclude))) {
      console.log(`Skipping excluded directory: ${dir}`);
      return;
    }

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        if (file === 'flac-manager' || file === '@eaDir') continue;
        await walk(filePath);
      } else if (file.toLowerCase().endsWith('.flac')) {
        const dbMtime = trackMap.get(filePath);
        const diskMtime = stat.mtime.getTime();
        if (dbMtime && Math.floor(dbMtime / 1000) === Math.floor(diskMtime / 1000)) {
          continue;
        }
        await processFlac(filePath, stat.mtime);
      }
    }
  }

  async function processFlac(filePath, mtime) {
    try {
      console.log(`Processing: ${filePath}`);
      const metadata = await mm.parseFile(filePath);
      const { common, format } = metadata;

      const dir = path.dirname(filePath);
      const relParts = MUSIC_DIR && dir.startsWith(MUSIC_DIR)
        ? dir.slice(MUSIC_DIR.length).split('/').filter(Boolean)
        : dir.split('/').filter(Boolean).slice(2);
      const manualGenre = relParts[0] || null;
      const folderArtist = relParts[1] || null;
      const folderAlbum = relParts[relParts.length - 1] || null;

      const rawArtist = (common.artist && common.artist.trim()) ? common.artist.trim() : null;
      let albumArtistName = (common.albumartist && common.albumartist.trim())
        ? common.albumartist.trim()
        : (folderArtist === 'Various Artists' ? 'Various Artists' : (rawArtist || folderArtist || 'Unknown Artist'));

      const albumTitle = (common.album && common.album.trim())
        ? common.album.trim()
        : (folderAlbum || 'Unknown Album');
      const trackTitle = (common.title && common.title.trim())
        ? common.title.trim()
        : path.basename(filePath, path.extname(filePath));
      const trackNumber = common.track.no || null;
      const discNumber = common.disk.no || 1;
      const year = common.year || null;
      const duration = Math.round(format.duration || 0);

      if (albumArtistName === 'autotune the world' || albumTitle.includes('Studio Simpa')) {
        albumArtistName = 'Various Artists';
      }

      let trackArtistName = rawArtist || albumArtistName;
      if (trackArtistName === 'Various Artists') {
        const titleMatch = trackTitle.match(/^(.+?)\s+-\s+(.+)$/);
        if (titleMatch) {
          trackArtistName = titleMatch[1].trim();
        }
      }

      const albumArtistReading = getReading(albumArtistName);
      const trackArtistReading = getReading(trackArtistName);
      const albumReading = getReading(albumTitle);
      const trackReading = getReading(trackTitle);

      const albumArtistId = await getOrCreateArtist(albumArtistName, albumArtistReading);
      const trackArtistId = trackArtistName === albumArtistName
        ? albumArtistId
        : await getOrCreateArtist(trackArtistName, trackArtistReading);

      const [albums] = await connection.query('SELECT id FROM albums WHERE folder_path = ?', [dir]);
      let albumId;
      if (albums.length === 0) {
        const [result] = await connection.query(
          `INSERT INTO albums (artist_id, title, year, folder_path, mtime, title_reading, manual_genre, added_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [albumArtistId, albumTitle, year, dir, mtime, albumReading, manualGenre]
        );
        albumId = result.insertId;

        let coverData = null;
        let coverExt = 'jpg';

        if (common.picture && common.picture.length > 0) {
          coverData = common.picture[0].data;
          coverExt = common.picture[0].format.split('/')[1] || 'jpg';
        } else {
          const possibleCovers = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png'];
          for (const name of possibleCovers) {
            const fullPath = path.join(dir, name);
            if (fs.existsSync(fullPath)) {
              coverData = fs.readFileSync(fullPath);
              coverExt = path.extname(name).slice(1);
              break;
            }
          }
        }

        if (coverData) {
          const coverFilename = `album_${albumId}.${coverExt}`;
          const coverPath = path.join(COVERS_DIR, coverFilename);
          fs.writeFileSync(coverPath, coverData);
          await connection.query('UPDATE albums SET cover_url = ? WHERE id = ?', [`/covers/${coverFilename}`, albumId]);
        }
      } else {
        albumId = albums[0].id;
        await connection.query(
          'UPDATE albums SET mtime = ?, title_reading = ?, manual_genre = COALESCE(manual_genre, ?) WHERE id = ?',
          [mtime, albumReading, manualGenre, albumId]
        );
      }

      const [tracks] = await connection.query('SELECT id FROM tracks WHERE file_path = ?', [filePath]);
      if (tracks.length === 0) {
        await connection.query(
          `INSERT INTO tracks (album_id, artist_id, track_artist, track_artist_reading, title, track_number, disc_number, duration, file_path, mtime, title_reading, manual_genre, added_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [albumId, trackArtistId, trackArtistName, trackArtistReading, trackTitle, trackNumber, discNumber, duration, filePath, mtime, trackReading, manualGenre]
        );
      } else {
        await connection.query(
          `UPDATE tracks
           SET album_id = ?, artist_id = ?, track_artist = ?, track_artist_reading = ?, title = ?, track_number = ?, disc_number = ?, mtime = ?, title_reading = ?, manual_genre = COALESCE(manual_genre, ?)
           WHERE id = ?`,
          [albumId, trackArtistId, trackArtistName, trackArtistReading, trackTitle, trackNumber, discNumber, mtime, trackReading, manualGenre, tracks[0].id]
        );
      }
    } catch (err) {
      console.error(`Error processing ${filePath}:`, err.message);
    }
  }

  console.log('Starting directory walk...');
  await walk(MUSIC_DIR);
  console.log('Scan complete.');
  await connection.end();
}

scan().catch(err => {
  console.error('Scan failed:', err);
  process.exit(1);
});
