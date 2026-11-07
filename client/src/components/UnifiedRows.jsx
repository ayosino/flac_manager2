import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Plus, MoreHorizontal, X, Image as ImageIcon, Volume2 } from 'lucide-react';
import { useApp, formatDuration, formatDate, formatCategory } from '../context/AppContext';

/**
 * Unified text-first Album Row used across Albums, Artist Detail, Folders, and Random views.
 */
export function AlbumRow({ album, index, totalCount, showArtist = true }) {
  const navigate = useNavigate();
  const { displayMode, openContextMenu } = useApp();
  const isCompact = displayMode === 'compact';
  const category = formatCategory(album.folder_path, album.manual_genre);

  const handleRowClick = () => {
    navigate(`/albums/${album.id}`);
  };

  const handleArtistClick = (e) => {
    if (!album.artist_id) return;
    e.stopPropagation();
    navigate(`/artists/${album.artist_id}`);
  };

  const handleMenuClick = (e) => {
    openContextMenu(e, 'album', {
      id: album.id,
      title: album.title,
      artist: album.artist_name
    });
  };

  return (
    <div
      onClick={handleRowClick}
      onContextMenu={handleMenuClick}
      className={`group flex items-center gap-3 border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors ${
        isCompact ? 'py-1.5 px-4 text-xs' : 'py-2.5 px-5 text-sm'
      }`}
    >
      {/* ID column */}
      <div className="w-12 shrink-0 font-mono text-[11px] text-[var(--text-muted)]">
        #{album.id}
      </div>

      {/* Index / Total column */}
      <div className="w-20 shrink-0 font-mono text-xs text-[var(--text-secondary)]">
        {index} / {totalCount}
      </div>

      {/* Artist column */}
      {showArtist && (
        <div
          onClick={handleArtistClick}
          className="w-48 shrink-0 font-semibold truncate hover:text-[var(--accent)] hover:underline"
          title={album.artist_name || 'Unknown'}
        >
          {album.artist_name || 'Unknown'}
        </div>
      )}

      {/* Album Title + Category tag */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="truncate font-medium text-[var(--text-primary)]">
          {album.title || 'Unknown Album'}
        </span>
        {category && (
          <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-mono">
            {category}
          </span>
        )}
        {album.cover_url && (
          <ImageIcon
            size={13}
            className="shrink-0 text-[var(--text-muted)] opacity-70"
            title="Cover art available"
          />
        )}
      </div>

      {/* Year & Date meta */}
      <div className="w-36 shrink-0 text-right text-xs text-[var(--text-secondary)] font-mono">
        {album.year || ''}
        {album.year && album.mtime ? ' • ' : ''}
        {formatDate(album.mtime)}
      </div>

      {/* Action button */}
      <button
        type="button"
        onClick={handleMenuClick}
        className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-opacity"
        title="Actions"
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

/**
 * Unified text-first Track Row used across Album Detail, Playlist Detail, Autogen, and History views.
 */
export function TrackRow({
  track,
  index,
  isMultiDisc = false,
  albumArtist = null,
  showAlbumBadge = false,
  playedAt = null,
  onRemove = null
}) {
  const navigate = useNavigate();
  const {
    displayMode,
    currentTrack,
    isPlaying,
    playDirectTrack,
    addTracksToQueue,
    openContextMenu
  } = useApp();

  const isCompact = displayMode === 'compact';
  const isActive = currentTrack?.id === track.id;

  const trackNoDisplay = index !== undefined
    ? index
    : isMultiDisc
      ? `${track.disc_number || 1}-${String(track.track_number || '-').padStart(2, '0')}`
      : (track.track_number ?? '-');

  const shouldShowArtist = !albumArtist || (track.artist_name && track.artist_name !== albumArtist);

  const handlePlay = () => {
    playDirectTrack(track);
  };

  const handleAddQueue = (e) => {
    e.stopPropagation();
    addTracksToQueue([track.id], false);
  };

  const handleAlbumClick = (e) => {
    if (!track.album_id) return;
    e.stopPropagation();
    navigate(`/albums/${track.album_id}`);
  };

  const handleMenu = (e) => {
    openContextMenu(e, 'track', {
      id: track.id,
      title: track.title,
      artist: track.artist_name || albumArtist || 'Unknown'
    });
  };

  return (
    <div
      onClick={handlePlay}
      onContextMenu={handleMenu}
      className={`group flex items-center gap-3 border-b border-[var(--border-color)] cursor-pointer transition-colors ${
        isCompact ? 'py-1.5 px-4 text-xs' : 'py-2 px-5 text-sm'
      } ${
        isActive
          ? 'bg-[var(--bg-active)] text-[var(--accent)] font-semibold'
          : 'hover:bg-[var(--bg-secondary)]'
      }`}
    >
      {/* Track # or Playing Indicator */}
      <div className="w-12 shrink-0 font-mono text-xs text-[var(--text-secondary)] flex items-center">
        {isActive ? (
          <Volume2 size={15} className={`text-[var(--accent)] ${isPlaying ? 'animate-pulse' : ''}`} />
        ) : (
          <span>{trackNoDisplay}</span>
        )}
      </div>

      {/* Track Title + Track Artist + Album Badge */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="truncate">{track.title}</span>
        {shouldShowArtist && track.artist_name && (
          <span className="shrink-0 text-xs text-[var(--text-secondary)] truncate max-w-[260px]">
            — {track.artist_name}
          </span>
        )}
        {showAlbumBadge && track.album_title && (
          <button
            type="button"
            onClick={handleAlbumClick}
            className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--accent)] truncate max-w-[220px]"
            title={track.album_title}
          >
            [{track.album_title}]
          </button>
        )}
      </div>

      {/* Optional Played At timestamp (History view) */}
      {playedAt && (
        <div className="w-40 shrink-0 text-right text-xs text-[var(--text-secondary)] font-mono">
          {new Date(playedAt).toLocaleString('ja-JP')}
        </div>
      )}

      {/* Hover quick actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={handleAddQueue}
          className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)]"
          title="Add to Queue"
        >
          <Plus size={15} />
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--danger)]"
            title="Remove from Playlist"
          >
            <X size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={handleMenu}
          className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)]"
          title="More Options"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>

      {/* Duration */}
      <div className="w-14 shrink-0 text-right font-mono text-xs text-[var(--text-secondary)]">
        {formatDuration(track.duration)}
      </div>
    </div>
  );
}

/**
 * Unified Pagination Bar
 */
export function Pager({ totalCount, page, totalPages, onPageChange }) {
  if (totalCount === 0) return null;

  return (
    <div className="flex items-center justify-center gap-3 py-2.5 px-4 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-xs">
      {totalPages <= 1 ? (
        <span className="text-[var(--text-secondary)] font-mono">
          Showing all {totalCount.toLocaleString()} items
        </span>
      ) : (
        <>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            className="px-2.5 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] disabled:opacity-40 hover:bg-[var(--bg-tertiary)] cursor-pointer disabled:cursor-default"
          >
            « First
          </button>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-2.5 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] disabled:opacity-40 hover:bg-[var(--bg-tertiary)] cursor-pointer disabled:cursor-default"
          >
            ‹ Prev
          </button>
          <span className="text-[var(--text-secondary)] font-mono px-2">
            Page {page} of {totalPages} ({totalCount.toLocaleString()} total)
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="px-2.5 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] disabled:opacity-40 hover:bg-[var(--bg-tertiary)] cursor-pointer disabled:cursor-default"
          >
            Next ›
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            className="px-2.5 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] disabled:opacity-40 hover:bg-[var(--bg-tertiary)] cursor-pointer disabled:cursor-default"
          >
            Last »
          </button>
        </>
      )}
    </div>
  );
}
