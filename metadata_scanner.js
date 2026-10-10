require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const mm = require('music-metadata');
const kuromoji = require('kuromoji');

const MUSIC_DIR = process.env.MUSIC_DIR;
const EXCLUDE_DIRS = process.env.EXCLUDE_DIRS ? process.env.EXCLUDE_DIRS.split(',').map(d => d.trim()) : [];
const COVERS_DIR = path.join(__dirname, 'public', 'covers');

const isFullScan = process.argv.includes('--full');

let tokenizer = null;

function initTokenizer() {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: 'node_modules/kuromoji/dict' }).build((err, _tokenizer) => {
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

  console.log('Starting scan...');

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

      const artistName = common.artist || 'Unknown Artist';
      let albumArtistName = common.albumartist || artistName;
      const albumTitle = common.album || 'Unknown Album';
      const trackTitle = common.title || path.basename(filePath, '.flac');
      const trackNumber = common.track.no || null;
      const year = common.year || null;
      const duration = Math.round(format.duration || 0);

      // Custom rule: Treat "autotune the world" and "Studio Simpa" compilation albums as "Various Artists"
      if (albumArtistName === 'autotune the world' || albumTitle.includes('Studio Simpa')) {
        albumArtistName = 'Various Artists';
      }

      const albumArtistReading = getReading(albumArtistName);
      const albumReading = getReading(albumTitle);
      const trackReading = getReading(trackTitle);

      // 1. Get or Create Artist (using albumArtistName to represent the album's artist)
      let [artists] = await connection.query('SELECT id FROM artists WHERE name = ?', [albumArtistName]);
      let artistId;
      if (artists.length === 0) {
        const [result] = await connection.query('INSERT INTO artists (name, name_reading) VALUES (?, ?)', [albumArtistName, albumArtistReading]);
        artistId = result.insertId;
      } else {
        artistId = artists[0].id;
        await connection.query('UPDATE artists SET name_reading = ? WHERE id = ?', [albumArtistReading, artistId]);
      }

      // 2. Get or Create Album
      let [albums] = await connection.query('SELECT id FROM albums WHERE artist_id = ? AND title = ?', [artistId, albumTitle]);
      let albumId;
      if (albums.length === 0) {
        const dir = path.dirname(filePath);
        const [result] = await connection.query(
          'INSERT INTO albums (artist_id, title, year, folder_path, mtime, title_reading, added_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
          [artistId, albumTitle, year, dir, mtime, albumReading]
        );
        albumId = result.insertId;
        
        // Handle Cover Art
        let coverData = null;
        let coverExt = 'jpg';

        if (common.picture && common.picture.length > 0) {
          coverData = common.picture[0].data;
          coverExt = common.picture[0].format.split('/')[1] || 'jpg';
        } else {
          const dir = path.dirname(filePath);
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
        // Update mtime and reading
        await connection.query('UPDATE albums SET mtime = ?, title_reading = ? WHERE id = ?', [mtime, albumReading, albumId]);
      }

      // 3. Insert or Update Track
      const [tracks] = await connection.query('SELECT id FROM tracks WHERE file_path = ?', [filePath]);
      if (tracks.length === 0) {
        await connection.query(
          'INSERT INTO tracks (album_id, title, track_number, duration, file_path, mtime, title_reading, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
          [albumId, trackTitle, trackNumber, duration, filePath, mtime, trackReading]
        );
      } else {
        await connection.query(
          'UPDATE tracks SET title = ?, track_number = ?, mtime = ?, title_reading = ? WHERE id = ?',
          [trackTitle, trackNumber, mtime, trackReading, tracks[0].id]
        );
      }
    } catch (err) {
      console.error(`Error processing ${filePath}:`, err.message);
    }
  }

  await walk(MUSIC_DIR);
  console.log('Scan complete.');
  await connection.end();
}

scan().catch(err => {
  console.error('Scan failed:', err);
  process.exit(1);
});
