import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTotalDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0 min';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs} hr ${mins} min`;
  return `${mins} min`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function formatCategory(folderPath, manualGenre) {
  if (manualGenre) return manualGenre;
  if (!folderPath) return '';
  const parts = folderPath.replace(/^\/+/, '').split('/');
  const idx = (parts[0] === 'mnt' && parts[1] === 'y') ? 2 : 0;
  return parts[idx] || '';
}

export function AppProvider({ children }) {
  const audioRef = useRef(new Audio());

  // Preferences
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [displayMode, setDisplayModeState] = useState(() => localStorage.getItem('mode') || 'normal');
  const [isAutoplay, setIsAutoplayState] = useState(() => localStorage.getItem('autoplay') === 'on');
  const [volume, setVolumeState] = useState(() => {
    const v = parseFloat(localStorage.getItem('volume'));
    return isNaN(v) ? 0.5 : v;
  });

  // Player & Queue state
  const [playQueue, setPlayQueue] = useState([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState('none'); // 'none' | 'all'
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const isQueueLoadedRef = useRef(false);

  // Playlists
  const [playlists, setPlaylists] = useState([]);

  // Overlays: Context Menu, Modal, Lightbox, Toasts
  const [contextMenu, setContextMenu] = useState(null);
  const [playlistModal, setPlaylistModal] = useState({ open: false, trackIds: [] });
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [toasts, setToasts] = useState([]);

  // Search & Sort state per view
  const [viewFilters, setViewFilters] = useState({
    albums: { page: 1, search: '', sort: 'alpha' },
    artists: { page: 1, search: '', sort: 'alpha' },
    playlists: { search: '' }
  });

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // Apply theme & mode to body
  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.body.dataset.mode = displayMode;
    localStorage.setItem('mode', displayMode);
  }, [displayMode]);

  useEffect(() => {
    localStorage.setItem('autoplay', isAutoplay ? 'on' : 'off');
  }, [isAutoplay]);

  useEffect(() => {
    audioRef.current.volume = volume;
    localStorage.setItem('volume', String(volume));
  }, [volume]);

  const setVolume = useCallback((val) => {
    const clamped = Math.max(0, Math.min(1, parseFloat(val)));
    setVolumeState(clamped);
  }, []);

  const changeVolume = useCallback((delta) => {
    setVolumeState(prev => Math.max(0, Math.min(1, Math.round((prev + delta) * 100) / 100)));
  }, []);

  // Sync queue & playlists
  const syncQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/queue');
      const data = await res.json();
      setPlayQueue(Array.isArray(data) ? data : []);
      isQueueLoadedRef.current = true;
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('Failed to sync queue:', e);
      return [];
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    try {
      const res = await fetch('/api/playlists');
      const data = await res.json();
      setPlaylists(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load playlists:', e);
    }
  }, []);

  const savePlaybackState = useCallback(async (queueItem, seekPos) => {
    if (!isQueueLoadedRef.current) return;
    try {
      await fetch('/api/playback-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_queue_id: queueItem?.queue_id || null,
          seek_position: seekPos ?? audioRef.current.currentTime ?? 0
        })
      });
    } catch (e) {
      console.error('Failed to save playback state:', e);
    }
  }, []);

  // Start playing a specific track object
  const startTrackPlayback = useCallback((track, queueIdx = -1, autoPlay = true, initialSeek = 0) => {
    if (!track) return;
    const audio = audioRef.current;
    setCurrentTrack(track);
    setCurrentQueueIndex(queueIdx);
    audio.src = `/api/stream/${track.id}`;
    audio.currentTime = initialSeek || 0;
    if (autoPlay) {
      audio.play().then(() => setIsPlaying(true)).catch(e => {
        console.error('Playback error:', e);
        setIsPlaying(false);
      });
      savePlaybackState(track, initialSeek || 0);
    } else {
      setIsPlaying(false);
    }
  }, [savePlaybackState]);

  const playTrackFromQueue = useCallback((idx, queueOverride = null) => {
    const q = queueOverride || playQueue;
    if (idx < 0 || idx >= q.length) return;
    startTrackPlayback(q[idx], idx, true, 0);
  }, [playQueue, startTrackPlayback]);

  const playDirectTrack = useCallback((track) => {
    // Check if track is already in queue
    const idx = playQueue.findIndex(item => item.id === track.id);
    startTrackPlayback(track, idx, true, 0);
  }, [playQueue, startTrackPlayback]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio.src) {
      if (playQueue.length > 0) {
        playTrackFromQueue(0);
      }
      return;
    }
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    } else {
      audio.pause();
      setIsPlaying(false);
      savePlaybackState(playQueue[currentQueueIndex], audio.currentTime);
    }
  }, [playQueue, currentQueueIndex, playTrackFromQueue, savePlaybackState]);

  const playNext = useCallback(async () => {
    if (playQueue.length === 0) return;
    if (isShuffle) {
      const randIdx = Math.floor(Math.random() * playQueue.length);
      playTrackFromQueue(randIdx);
      return;
    }
    if (currentQueueIndex < playQueue.length - 1) {
      playTrackFromQueue(currentQueueIndex + 1);
      return;
    }
    // End of queue: check FAISS Autoplay
    if (isAutoplay && currentTrack?.id) {
      try {
        const res = await fetch(`/api/recommendations/${currentTrack.id}?limit=5`);
        const recs = await res.json();
        if (Array.isArray(recs) && recs.length > 0) {
          await fetch('/api/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackIds: recs.map(t => t.id) })
          });
          const updatedQueue = await syncQueue();
          addToast(`Autoplay added ${recs.length} similar tracks`);
          playTrackFromQueue(currentQueueIndex + 1, updatedQueue);
          return;
        }
      } catch (e) {
        console.error('Autoplay error:', e);
      }
    }
    if (repeatMode === 'all') {
      playTrackFromQueue(0);
    } else {
      setIsPlaying(false);
    }
  }, [playQueue, isShuffle, currentQueueIndex, isAutoplay, currentTrack, repeatMode, playTrackFromQueue, syncQueue, addToast]);

  const playPrev = useCallback(() => {
    const audio = audioRef.current;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (currentQueueIndex > 0) {
      playTrackFromQueue(currentQueueIndex - 1);
    } else {
      audio.currentTime = 0;
    }
  }, [currentQueueIndex, playTrackFromQueue]);

  const seekTo = useCallback((newTime) => {
    const audio = audioRef.current;
    if (!audio.duration) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, newTime));
    setCurrentTime(audio.currentTime);
  }, []);

  // Queue mutation actions
  const addTracksToQueue = useCallback(async (trackIds, playImmediately = false) => {
    if (!Array.isArray(trackIds) || trackIds.length === 0) return;
    try {
      const prevLen = playQueue.length;
      await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds })
      });
      const updated = await syncQueue();
      if (playImmediately && updated.length > prevLen) {
        playTrackFromQueue(prevLen, updated);
      } else {
        addToast(`Added ${trackIds.length} track${trackIds.length > 1 ? 's' : ''} to queue`);
      }
    } catch (e) {
      console.error('Failed to add tracks to queue:', e);
    }
  }, [playQueue.length, syncQueue, playTrackFromQueue, addToast]);

  const clearQueue = useCallback(async (showNotification = true) => {
    try {
      await fetch('/api/queue/clear', { method: 'POST' });
      const audio = audioRef.current;
      audio.pause();
      audio.removeAttribute('src');
      setPlayQueue([]);
      setCurrentQueueIndex(-1);
      setCurrentTrack(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      if (showNotification) addToast('Queue cleared');
    } catch (e) {
      console.error('Failed to clear queue:', e);
    }
  }, [addToast]);

  const playTracksNow = useCallback(async (trackIds) => {
    if (!Array.isArray(trackIds) || trackIds.length === 0) return;
    await fetch('/api/queue/clear', { method: 'POST' });
    await fetch('/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackIds })
    });
    const updated = await syncQueue();
    if (updated.length > 0) {
      playTrackFromQueue(0, updated);
    }
  }, [syncQueue, playTrackFromQueue]);

  const removeFromQueue = useCallback(async (idx) => {
    const item = playQueue[idx];
    if (!item) return;
    try {
      await fetch(`/api/queue/${item.queue_id}`, { method: 'DELETE' });
      if (currentQueueIndex === idx) {
        const audio = audioRef.current;
        audio.pause();
        audio.removeAttribute('src');
        setCurrentQueueIndex(-1);
        setCurrentTrack(null);
        setIsPlaying(false);
      } else if (currentQueueIndex > idx) {
        setCurrentQueueIndex(prev => prev - 1);
      }
      await syncQueue();
    } catch (e) {
      console.error('Failed to remove queue item:', e);
    }
  }, [playQueue, currentQueueIndex, syncQueue]);

  // Album / Artist / Folder / Playlist helpers
  const addAlbumToQueue = useCallback(async (albumId, playNow = false) => {
    const res = await fetch(`/api/albums/${albumId}/tracks`);
    const tracks = await res.json();
    const ids = tracks.map(t => t.id);
    if (playNow) await playTracksNow(ids);
    else await addTracksToQueue(ids, false);
  }, [playTracksNow, addTracksToQueue]);

  const addArtistToQueue = useCallback(async (artistId, playNow = false) => {
    const res = await fetch(`/api/artists/${artistId}/tracks`);
    const tracks = await res.json();
    const ids = tracks.map(t => t.id);
    if (playNow) await playTracksNow(ids);
    else await addTracksToQueue(ids, false);
  }, [playTracksNow, addTracksToQueue]);

  const addFolderToQueue = useCallback(async (folderPath, playNow = false) => {
    const res = await fetch(`/api/folders/tracks?path=${encodeURIComponent(folderPath)}`);
    const tracks = await res.json();
    const ids = tracks.map(t => t.id);
    if (playNow) await playTracksNow(ids);
    else await addTracksToQueue(ids, false);
  }, [playTracksNow, addTracksToQueue]);

  const addPlaylistToQueue = useCallback(async (playlistId, playNow = false) => {
    const res = await fetch(`/api/playlists/${playlistId}/tracks`);
    const tracks = await res.json();
    const ids = tracks.map(t => t.id);
    if (playNow) await playTracksNow(ids);
    else await addTracksToQueue(ids, false);
  }, [playTracksNow, addTracksToQueue]);

  // Playlist mutations
  const addTracksToPlaylist = useCallback(async (playlistId, trackIds) => {
    if (!trackIds || trackIds.length === 0) return;
    await fetch(`/api/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackIds })
    });
    await loadPlaylists();
    addToast(`Added ${trackIds.length} track${trackIds.length > 1 ? 's' : ''} to playlist`);
  }, [loadPlaylists, addToast]);

  const createPlaylistWithTracks = useCallback(async (name, trackIds = []) => {
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const created = await res.json();
    if (trackIds.length > 0 && created.id) {
      await fetch(`/api/playlists/${created.id}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds })
      });
    }
    await loadPlaylists();
    addToast(`Playlist "${name}" created`);
    return created;
  }, [loadPlaylists, addToast]);

  const deletePlaylist = useCallback(async (playlistId, name) => {
    await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });
    await loadPlaylists();
    addToast(`Deleted playlist "${name || ''}"`);
  }, [loadPlaylists, addToast]);

  // Initial load: queue, playback state, playlists
  useEffect(() => {
    (async () => {
      const q = await syncQueue();
      await loadPlaylists();
      try {
        const res = await fetch('/api/playback-state');
        const state = await res.json();
        if (state?.current_queue_id && q.length > 0) {
          const idx = q.findIndex(item => item.queue_id === state.current_queue_id);
          if (idx !== -1) {
            startTrackPlayback(q[idx], idx, false, state.seek_position || 0);
          }
        }
      } catch (e) {
        console.error('Failed to restore playback state:', e);
      }
    })();
  }, [syncQueue, loadPlaylists, startTrackPlayback]);

  // Audio Element Event Listeners
  useEffect(() => {
    const audio = audioRef.current;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
      setDuration(audio.duration || 0);
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const onEnded = async () => {
      if (currentTrack?.id) {
        try {
          await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId: currentTrack.id })
          });
        } catch (e) {
          console.error('Failed to record playback history:', e);
        }
      }
      playNext();
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [currentTrack, playNext]);

  // Save playback state every 5 seconds while playing
  useEffect(() => {
    const timer = setInterval(() => {
      if (isPlaying && currentQueueIndex !== -1 && playQueue[currentQueueIndex]) {
        savePlaybackState(playQueue[currentQueueIndex], audioRef.current.currentTime);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [isPlaying, currentQueueIndex, playQueue, savePlaybackState]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (k === 'q') {
        setIsQueueOpen(prev => !prev);
      } else if (k === 'k') {
        changeVolume(0.05);
      } else if (k === 'j') {
        changeVolume(-0.05);
      } else if (k === 'l' || k === 'n') {
        playNext();
      } else if (k === 'h' || k === 'p') {
        playPrev();
      } else if (e.key === 'Escape') {
        setContextMenu(null);
        setLightboxUrl(null);
        setPlaylistModal({ open: false, trackIds: [] });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, changeVolume, playNext, playPrev]);

  const openContextMenu = useCallback((e, type, data) => {
    e.preventDefault();
    e.stopPropagation();
    const menuW = 220;
    const menuH = 280;
    const x = Math.min(e.clientX, window.innerWidth - menuW - 12);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 12);
    setContextMenu({ x, y, type, data });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const value = {
    theme,
    setTheme: setThemeState,
    displayMode,
    setDisplayMode: setDisplayModeState,
    isAutoplay,
    setIsAutoplay: setIsAutoplayState,
    volume,
    setVolume,
    changeVolume,
    playQueue,
    currentQueueIndex,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    isShuffle,
    setIsShuffle,
    repeatMode,
    setRepeatMode,
    isQueueOpen,
    setIsQueueOpen,
    playlists,
    loadPlaylists,
    viewFilters,
    setViewFilters,
    togglePlay,
    playNext,
    playPrev,
    seekTo,
    playTrackFromQueue,
    playDirectTrack,
    addTracksToQueue,
    playTracksNow,
    removeFromQueue,
    clearQueue,
    addAlbumToQueue,
    addArtistToQueue,
    addFolderToQueue,
    addPlaylistToQueue,
    addTracksToPlaylist,
    createPlaylistWithTracks,
    deletePlaylist,
    contextMenu,
    openContextMenu,
    closeContextMenu,
    playlistModal,
    setPlaylistModal,
    lightboxUrl,
    setLightboxUrl,
    toasts,
    addToast
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
