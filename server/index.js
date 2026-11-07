require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');

const libraryRoutes = require('./routes/libraryRoutes');
const playerRoutes = require('./routes/playerRoutes');
const playlistRoutes = require('./routes/playlistRoutes');
const { initFaiss } = require('./services/faissService');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  }
  next();
});

// Static cover art
const coversPath = path.join(__dirname, '..', 'public', 'covers');
app.use('/covers', express.static(coversPath));

// API routes
app.use('/api', libraryRoutes);
app.use('/api', playerRoutes);
app.use('/api', playlistRoutes);

// Serve built React SPA from client/dist
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));

// SPA fallback for React Router
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/covers')) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

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

app.listen(PORT, HOST, () => {
  const localIP = getLocalIP();
  console.log('FLAC Music Manager (Theatre of Eternal Music) running at:');
  console.log(`- Local:   http://localhost:${PORT}`);
  console.log(`- Network: http://${localIP}:${PORT}`);

  initFaiss().then(() => {
    console.log('FAISS initialization complete.');
  });
});
