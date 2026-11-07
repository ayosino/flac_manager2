import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  ListMusic,
  Volume2,
  VolumeX,
  X,
  Trash2,
  Disc,
  Plus,
  FolderPlus
} from 'lucide-react';
import { useApp, formatDuration } from '../context/AppContext';

export function PlayerBar() {
  const navigate = useNavigate();
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    setVolume,
    isShuffle,
    setIsShuffle,
    repeatMode,
    setRepeatMode,
    isQueueOpen,
    setIsQueueOpen,
    playQueue,
    togglePlay,
    playNext,
    playPrev,
    seekTo
  } = useApp();

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const handleSeekClick = (e) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 h-[76px] bg-[var(--bg-primary)] border-t border-[var(--border-color)] px-6 flex items-center justify-between z-40 select-none">
      {/* Left: Now Playing Info + Optional Cover Art Thumbnail */}
      <div className="w-[30%] min-w-0 flex items-center gap-3 pr-4">
        {currentTrack ? (
          <>
            <div
              onClick={() => currentTrack.album_id && navigate(`/albums/${currentTrack.album_id}`)}
              className={`w-12 h-12 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] shrink-0 overflow-hidden flex items-center justify-center ${
                currentTrack.album_id ? 'cursor-pointer hover:opacity-85' : ''
              }`}
              title={currentTrack.album_title ? `Go to album: ${currentTrack.album_title}` : ''}
            >
              {currentTrack.cover_url ? (
                <img
                  src={currentTrack.cover_url}
                  alt={currentTrack.album_title || currentTrack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Disc size={22} className="text-[var(--text-muted)]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div
                onClick={() => currentTrack.album_id && navigate(`/albums/${currentTrack.album_id}`)}
                className={`font-semibold text-sm truncate ${
                  currentTrack.album_id ? 'cursor-pointer hover:text-[var(--accent)]' : ''
                }`}
                title={currentTrack.title}
              >
                {currentTrack.title}
              </div>
              <div className="text-xs text-[var(--text-secondary)] truncate" title={currentTrack.artist_name}>
                {currentTrack.artist_name || 'Unknown Artist'}
                {currentTrack.album_title ? ` • ${currentTrack.album_title}` : ''}
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-[var(--text-muted)] font-medium">Not Playing</div>
        )}
      </div>

      {/* Center: Playback Controls & Progress Bar */}
      <div className="w-[40%] max-w-xl flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setIsShuffle(!isShuffle)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isShuffle
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title="Shuffle"
          >
            <Shuffle size={15} />
          </button>

          <button
            type="button"
            onClick={playPrev}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Previous (h / p)"
          >
            <SkipBack size={17} />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white flex items-center justify-center shadow-sm transition-colors cursor-pointer"
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={playNext}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Next (l / n)"
          >
            <SkipForward size={17} />
          </button>

          <button
            type="button"
            onClick={() => setRepeatMode(repeatMode === 'none' ? 'all' : 'none')}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              repeatMode !== 'none'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title="Repeat All"
          >
            <Repeat size={15} />
          </button>
        </div>

        <div className="w-full flex items-center gap-3 text-[11px] font-mono text-[var(--text-secondary)]">
          <span className="w-9 text-right">{formatDuration(currentTime)}</span>
          <div
            onClick={handleSeekClick}
            className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full cursor-pointer relative overflow-hidden group"
          >
            <div
              className="h-full bg-[var(--accent)] rounded-full transition-all duration-75"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="w-9">{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Right: Queue Drawer Toggle & Volume */}
      <div className="w-[30%] flex items-center justify-end gap-4">
        <button
          type="button"
          onClick={() => setIsQueueOpen(!isQueueOpen)}
          className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-mono border transition-colors cursor-pointer ${
            isQueueOpen
              ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
              : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
          }`}
          title="Toggle Play Queue (q)"
        >
          <ListMusic size={15} />
          <span>{playQueue.length}</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVolume(volume > 0 ? 0 : 0.5)}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            title="Mute / Unmute"
          >
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className="w-24 accent-[var(--accent)] cursor-pointer"
            title={`Volume: ${Math.round(volume * 100)}% (j / k)`}
          />
        </div>
      </div>
    </div>
  );
}

export function QueueDrawer() {
  const {
    isQueueOpen,
    setIsQueueOpen,
    playQueue,
    currentQueueIndex,
    playTrackFromQueue,
    removeFromQueue,
    clearQueue,
    openContextMenu
  } = useApp();

  const activeItemRef = useRef(null);

  useEffect(() => {
    if (isQueueOpen && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentQueueIndex, isQueueOpen]);

  return (
    <div
      className={`fixed top-0 right-0 h-full w-[360px] max-w-full bg-[var(--bg-primary)] border-l border-[var(--border-color)] shadow-xl z-50 flex flex-col pb-[76px] transition-transform duration-200 ${
        isQueueOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-2">
          <ListMusic size={17} className="text-[var(--accent)]" />
          <h3 className="font-semibold text-sm m-0">Play Queue ({playQueue.length})</h3>
        </div>
        <div className="flex items-center gap-2">
          {playQueue.length > 0 && (
            <button
              type="button"
              onClick={() => clearQueue(true)}
              className="px-2 py-1 rounded text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--danger)] flex items-center gap-1 cursor-pointer"
              title="Clear Entire Queue"
            >
              <Trash2 size={12} />
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsQueueOpen(false)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {playQueue.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)]">
            Queue is empty. Click + or right-click any track, album, or folder to add tracks.
          </div>
        ) : (
          playQueue.map((item, idx) => {
            const isActive = currentQueueIndex === idx;
            return (
              <div
                key={item.queue_id || `${item.id}-${idx}`}
                ref={isActive ? activeItemRef : null}
                onClick={() => playTrackFromQueue(idx)}
                onContextMenu={(e) =>
                  openContextMenu(e, 'track', {
                    id: item.id,
                    title: item.title,
                    artist: item.artist_name
                  })
                }
                className={`group px-4 py-2 border-b border-[var(--border-color)] flex items-center gap-2.5 cursor-pointer text-xs transition-colors ${
                  isActive
                    ? 'bg-[var(--bg-active)] text-[var(--accent)] font-semibold'
                    : 'hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <div className="w-12 shrink-0 font-mono text-[11px] text-[var(--text-muted)]">
                  {idx + 1}/{playQueue.length}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{item.title}</div>
                  <div className="text-[11px] text-[var(--text-secondary)] truncate">
                    {item.artist_name || 'Unknown'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromQueue(idx);
                  }}
                  className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--danger)] hover:bg-[var(--bg-tertiary)] opacity-60 group-hover:opacity-100 cursor-pointer"
                  title="Remove from Queue"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function ContextMenu() {
  const {
    contextMenu,
    closeContextMenu,
    playlists,
    addTracksToQueue,
    playTracksNow,
    addAlbumToQueue,
    addArtistToQueue,
    addFolderToQueue,
    addPlaylistToQueue,
    addTracksToPlaylist,
    deletePlaylist,
    setPlaylistModal
  } = useApp();

  useEffect(() => {
    if (!contextMenu) return;
    const handleGlobalClick = () => closeContextMenu();
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;
  const { x, y, type, data } = contextMenu;

  const handleAddAlbumToPlaylist = async (playlistId) => {
    closeContextMenu();
    const res = await fetch(`/api/albums/${data.id}/tracks`);
    const tracks = await res.json();
    const ids = tracks.map(t => t.id);
    if (playlistId) await addTracksToPlaylist(playlistId, ids);
    else setPlaylistModal({ open: true, trackIds: ids });
  };

  const handleAddFolderToPlaylist = async (playlistId) => {
    closeContextMenu();
    const res = await fetch(`/api/folders/tracks?path=${encodeURIComponent(data.path)}`);
    const tracks = await res.json();
    const ids = tracks.map(t => t.id);
    if (playlistId) await addTracksToPlaylist(playlistId, ids);
    else setPlaylistModal({ open: true, trackIds: ids });
  };

  return (
    <div
      style={{ left: `${x}px`, top: `${y}px` }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 min-w-[210px] max-w-[260px] bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md shadow-xl py-1 text-xs text-[var(--text-primary)]"
    >
      {type === 'album' && (
        <>
          <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] border-b border-[var(--border-color)] truncate">
            {data.title}
          </div>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              addAlbumToQueue(data.id, true);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] flex items-center gap-2 cursor-pointer"
          >
            <Play size={13} /> Play Album Now
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              addAlbumToQueue(data.id, false);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] flex items-center gap-2 cursor-pointer"
          >
            <Plus size={13} /> Add Album to Queue
          </button>
          <div className="px-3 py-1 mt-1 border-t border-[var(--border-color)] font-semibold text-[11px] text-[var(--text-secondary)]">
            Add to Playlist:
          </div>
          <div className="max-h-40 overflow-y-auto">
            {playlists.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleAddAlbumToPlaylist(p.id)}
                className="w-full text-left px-5 py-1.5 hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] truncate cursor-pointer"
              >
                {p.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => handleAddAlbumToPlaylist(null)}
            className="w-full text-left px-4 py-1.5 text-[var(--accent)] font-medium hover:bg-[var(--bg-secondary)] flex items-center gap-1.5 cursor-pointer"
          >
            <FolderPlus size={13} /> + New Playlist...
          </button>
        </>
      )}

      {type === 'folder' && (
        <>
          <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] border-b border-[var(--border-color)] truncate">
            📁 {data.name}
          </div>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              addFolderToQueue(data.path, true);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] flex items-center gap-2 cursor-pointer"
          >
            <Play size={13} /> Play All in Folder Now
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              addFolderToQueue(data.path, false);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] flex items-center gap-2 cursor-pointer"
          >
            <Plus size={13} /> Add All in Folder to Queue
          </button>
          <div className="px-3 py-1 mt-1 border-t border-[var(--border-color)] font-semibold text-[11px] text-[var(--text-secondary)]">
            Add to Playlist:
          </div>
          <div className="max-h-40 overflow-y-auto">
            {playlists.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleAddFolderToPlaylist(p.id)}
                className="w-full text-left px-5 py-1.5 hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] truncate cursor-pointer"
              >
                {p.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => handleAddFolderToPlaylist(null)}
            className="w-full text-left px-4 py-1.5 text-[var(--accent)] font-medium hover:bg-[var(--bg-secondary)] flex items-center gap-1.5 cursor-pointer"
          >
            <FolderPlus size={13} /> + New Playlist...
          </button>
        </>
      )}

      {type === 'artist' && (
        <>
          <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] border-b border-[var(--border-color)] truncate">
            {data.name}
          </div>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              addArtistToQueue(data.id, true);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] flex items-center gap-2 cursor-pointer"
          >
            <Play size={13} /> Play All Artist Tracks
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              addArtistToQueue(data.id, false);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] flex items-center gap-2 cursor-pointer"
          >
            <Plus size={13} /> Add All Artist Tracks to Queue
          </button>
        </>
      )}

      {type === 'playlist' && (
        <>
          <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] border-b border-[var(--border-color)] truncate">
            {data.name}
          </div>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              addPlaylistToQueue(data.id, true);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] flex items-center gap-2 cursor-pointer"
          >
            <Play size={13} /> Play Playlist Now
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              addPlaylistToQueue(data.id, false);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] flex items-center gap-2 cursor-pointer"
          >
            <Plus size={13} /> Add Playlist to Queue
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              deletePlaylist(data.id, data.name);
            }}
            className="w-full text-left px-3 py-2 border-t border-[var(--border-color)] text-[var(--danger)] hover:bg-[var(--bg-secondary)] flex items-center gap-2 cursor-pointer"
          >
            <Trash2 size={13} /> Delete Playlist
          </button>
        </>
      )}

      {type === 'track' && (
        <>
          <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] border-b border-[var(--border-color)] truncate">
            {data.title}
          </div>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              playTracksNow([data.id]);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] flex items-center gap-2 cursor-pointer"
          >
            <Play size={13} /> Play Now
          </button>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              addTracksToQueue([data.id], false);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] flex items-center gap-2 cursor-pointer"
          >
            <Plus size={13} /> Add to Queue
          </button>
          <div className="px-3 py-1 mt-1 border-t border-[var(--border-color)] font-semibold text-[11px] text-[var(--text-secondary)]">
            Add to Playlist:
          </div>
          <div className="max-h-40 overflow-y-auto">
            {playlists.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  closeContextMenu();
                  addTracksToPlaylist(p.id, [data.id]);
                }}
                className="w-full text-left px-5 py-1.5 hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] truncate cursor-pointer"
              >
                {p.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              closeContextMenu();
              setPlaylistModal({ open: true, trackIds: [data.id] });
            }}
            className="w-full text-left px-4 py-1.5 text-[var(--accent)] font-medium hover:bg-[var(--bg-secondary)] flex items-center gap-1.5 cursor-pointer"
          >
            <FolderPlus size={13} /> + New Playlist...
          </button>
        </>
      )}
    </div>
  );
}

export function CreatePlaylistModal() {
  const { playlistModal, setPlaylistModal, createPlaylistWithTracks } = useApp();
  const [name, setName] = useState('');

  useEffect(() => {
    if (playlistModal.open) setName('');
  }, [playlistModal.open]);

  if (!playlistModal.open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createPlaylistWithTracks(name.trim(), playlistModal.trackIds || []);
    setPlaylistModal({ open: false, trackIds: [] });
  };

  return (
    <div
      onClick={() => setPlaylistModal({ open: false, trackIds: [] })}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-2xl p-5"
      >
        <h3 className="text-base font-semibold mt-0 mb-3">Create New Playlist</h3>
        {playlistModal.trackIds?.length > 0 && (
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            {playlistModal.trackIds.length} track(s) will be added automatically.
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            autoFocus
            placeholder="Playlist name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
          <div className="flex justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={() => setPlaylistModal({ open: false, trackIds: [] })}
              className="px-3 py-1.5 text-xs rounded border border-[var(--border-color)] hover:bg-[var(--bg-secondary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-1.5 text-xs rounded bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 cursor-pointer"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CoverLightbox() {
  const { lightboxUrl, setLightboxUrl } = useApp();
  if (!lightboxUrl) return null;

  return (
    <div
      onClick={() => setLightboxUrl(null)}
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6 cursor-zoom-out"
    >
      <img
        src={lightboxUrl}
        alt="Album Cover"
        className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
      />
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-22 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="px-3.5 py-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-xs font-medium text-[var(--text-primary)] shadow-lg"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
