import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Plus,
  RefreshCw,
  Folder,
  CornerLeftUp,
  Disc,
  ZoomIn,
  Trash2,
  Save,
  Sparkles,
  MoreHorizontal
} from 'lucide-react';
import {
  useApp,
  formatTotalDuration,
  formatDate,
  formatCategory
} from '../context/AppContext';
import { AlbumRow, TrackRow, Pager } from '../components/UnifiedRows';

/**
 * 1. Albums View (/albums)
 */
export function AlbumsView() {
  const { viewFilters, setViewFilters } = useApp();
  const { page, search, sort, genre } = viewFilters.albums;
  const [data, setData] = useState({ data: [], totalCount: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const limit = 50;

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort: sort || 'alpha'
    });
    if (search) params.set('search', search);
    if (genre) params.set('genre', genre);

    fetch(`/api/albums?${params.toString()}`)
      .then(r => r.json())
      .then(res => {
        if (active) {
          setData({
            data: res.data || [],
            totalCount: res.totalCount || 0,
            page: res.page || 1,
            totalPages: res.totalPages || 1
          });
          setLoading(false);
        }
      })
      .catch(() => active && setLoading(false));
    return () => { active = false; };
  }, [page, search, sort, genre]);

  const handlePageChange = (newPage) => {
    setViewFilters(prev => ({
      ...prev,
      albums: { ...prev.albums, page: newPage }
    }));
    window.scrollTo(0, 0);
  };

  const startIdx = (data.page - 1) * limit;

  return (
    <div>
      <Pager
        totalCount={data.totalCount}
        page={data.page}
        totalPages={data.totalPages}
        onPageChange={handlePageChange}
      />
      {loading ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading albums...</div>
      ) : data.data.length === 0 ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">No albums found.</div>
      ) : (
        <div>
          {data.data.map((album, i) => (
            <AlbumRow
              key={album.id}
              album={album}
              index={startIdx + i + 1}
              totalCount={data.totalCount}
            />
          ))}
        </div>
      )}
      <Pager
        totalCount={data.totalCount}
        page={data.page}
        totalPages={data.totalPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}

/**
 * 2. Album Detail View (/albums/:id) - Displays Cover Art & Track List
 */
export function AlbumDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    addAlbumToQueue,
    openContextMenu,
    setLightboxUrl
  } = useApp();

  const [album, setAlbum] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/albums/${id}`).then(r => (r.ok ? r.json() : null)),
      fetch(`/api/albums/${id}/tracks`).then(r => (r.ok ? r.json() : []))
    ])
      .then(([albData, trkData]) => {
        if (!active) return;
        setAlbum(albData);
        setTracks(Array.isArray(trkData) ? trkData : []);
        setLoading(false);
        window.scrollTo(0, 0);
      })
      .catch(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading album...</div>;
  }

  if (!album) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">Album not found.</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-3 px-3 py-1.5 text-xs rounded border border-[var(--border-color)] cursor-pointer"
        >
          ← Go Back
        </button>
      </div>
    );
  }

  const isMultiDisc = tracks.some(t => (t.disc_number || 1) > 1);
  const totalSeconds = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  const category = formatCategory(album.folder_path, album.manual_genre);

  return (
    <div>
      {/* Back navigation bar */}
      <div className="px-5 py-2.5 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-primary)]">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-[11px] font-mono text-[var(--text-muted)]">Album #{album.id}</span>
      </div>

      {/* Album Header with Cover Art */}
      <div className="p-5 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex flex-col sm:flex-row gap-5 items-start">
        {/* Cover Art Box */}
        <div
          onClick={() => album.cover_url && setLightboxUrl(album.cover_url)}
          className={`w-36 h-36 sm:w-40 sm:h-40 rounded-md border border-[var(--border-color)] bg-[var(--bg-tertiary)] shrink-0 overflow-hidden flex items-center justify-center relative group shadow-sm ${
            album.cover_url ? 'cursor-zoom-in' : ''
          }`}
        >
          {album.cover_url ? (
            <>
              <img
                src={album.cover_url}
                alt={album.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <ZoomIn size={22} />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-[var(--text-muted)]">
              <Disc size={36} />
              <span className="text-[10px] font-mono uppercase tracking-wider">No Cover</span>
            </div>
          )}
        </div>

        {/* Metadata & Action Buttons */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {category && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-mono">
                  {category}
                </span>
              )}
              {album.year && (
                <span className="text-xs font-mono text-[var(--text-secondary)]">{album.year}</span>
              )}
              {isMultiDisc && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-active)] text-[var(--accent)] font-mono">
                  Multi-Disc
                </span>
              )}
            </div>

            <h2 className="text-xl font-bold m-0 mb-1 leading-snug break-words">{album.title}</h2>

            <div className="text-sm font-semibold mb-2">
              {album.artist_id ? (
                <span
                  onClick={() => navigate(`/artists/${album.artist_id}`)}
                  className="text-[var(--accent)] hover:underline cursor-pointer"
                >
                  {album.artist_name}
                </span>
              ) : (
                <span>{album.artist_name || 'Unknown Artist'}</span>
              )}
            </div>

            <div className="text-xs text-[var(--text-secondary)] font-mono flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{tracks.length} tracks</span>
              <span>•</span>
              <span>{formatTotalDuration(totalSeconds)}</span>
              {album.mtime && (
                <>
                  <span>•</span>
                  <span>Updated {formatDate(album.mtime)}</span>
                </>
              )}
            </div>

            {album.folder_path && (
              <div
                onClick={() => navigate(`/folders?path=${encodeURIComponent(album.folder_path)}`)}
                className="mt-2 text-[11px] font-mono text-[var(--text-muted)] hover:text-[var(--accent)] truncate cursor-pointer"
                title="Open folder in Folders view"
              >
                📁 {album.folder_path}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => addAlbumToQueue(album.id, true)}
              className="px-3.5 py-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Play size={14} /> Play Album
            </button>
            <button
              type="button"
              onClick={() => addAlbumToQueue(album.id, false)}
              className="px-3 py-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} /> Add to Queue
            </button>
            <button
              type="button"
              onClick={(e) =>
                openContextMenu(e, 'album', {
                  id: album.id,
                  title: album.title,
                  artist: album.artist_name
                })
              }
              className="px-2.5 py-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-xs flex items-center gap-1 cursor-pointer"
              title="More Album Actions (Add to Playlist...)"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Unified Track List */}
      <div>
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            isMultiDisc={isMultiDisc}
            albumArtist={album.artist_name}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 3. Artists View (/artists)
 */
export function ArtistsView() {
  const navigate = useNavigate();
  const { viewFilters, setViewFilters, displayMode, openContextMenu } = useApp();
  const { page, search, sort, genre } = viewFilters.artists;
  const [data, setData] = useState({ data: [], totalCount: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const limit = 50;
  const isCompact = displayMode === 'compact';

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort: sort || 'alpha'
    });
    if (search) params.set('search', search);
    if (genre) params.set('genre', genre);

    fetch(`/api/artists?${params.toString()}`)
      .then(r => r.json())
      .then(res => {
        if (active) {
          setData({
            data: res.data || [],
            totalCount: res.totalCount || 0,
            page: res.page || 1,
            totalPages: res.totalPages || 1
          });
          setLoading(false);
        }
      })
      .catch(() => active && setLoading(false));
    return () => { active = false; };
  }, [page, search, sort, genre]);

  const handlePageChange = (newPage) => {
    setViewFilters(prev => ({
      ...prev,
      artists: { ...prev.artists, page: newPage }
    }));
    window.scrollTo(0, 0);
  };

  const startIdx = (data.page - 1) * limit;

  return (
    <div>
      <Pager
        totalCount={data.totalCount}
        page={data.page}
        totalPages={data.totalPages}
        onPageChange={handlePageChange}
      />
      {loading ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading artists...</div>
      ) : data.data.length === 0 ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">No artists found.</div>
      ) : (
        data.data.map((artist, i) => {
          const category = formatCategory(artist.folder_path);
          return (
            <div
              key={artist.id}
              onClick={() => navigate(`/artists/${artist.id}`)}
              onContextMenu={(e) => openContextMenu(e, 'artist', { id: artist.id, name: artist.name })}
              className={`group flex items-center gap-3 border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors ${
                isCompact ? 'py-1.5 px-4 text-xs' : 'py-2.5 px-5 text-sm'
              }`}
            >
              <div className="w-12 shrink-0 font-mono text-[11px] text-[var(--text-muted)]">
                #{artist.id}
              </div>
              <div className="w-20 shrink-0 font-mono text-xs text-[var(--text-secondary)]">
                {startIdx + i + 1} / {data.totalCount}
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="font-semibold truncate">{artist.name}</span>
                {category && (
                  <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-mono">
                    {category}
                  </span>
                )}
              </div>
              <div className="w-28 shrink-0 text-right font-mono text-xs text-[var(--text-secondary)]">
                {artist.album_count || 0} {artist.album_count === 1 ? 'album' : 'albums'}
              </div>
              <button
                type="button"
                onClick={(e) => openContextMenu(e, 'artist', { id: artist.id, name: artist.name })}
                className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-opacity"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          );
        })
      )}
      <Pager
        totalCount={data.totalCount}
        page={data.page}
        totalPages={data.totalPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}

/**
 * 4. Artist Detail View (/artists/:id)
 */
export function ArtistDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addArtistToQueue } = useApp();

  const [artist, setArtist] = useState(null);
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/artists/${id}`).then(r => (r.ok ? r.json() : null)),
      fetch(`/api/artists/${id}/albums`).then(r => (r.ok ? r.json() : []))
    ])
      .then(([artData, albData]) => {
        if (!active) return;
        setArtist(artData);
        setAlbums(Array.isArray(albData) ? albData : []);
        setLoading(false);
        window.scrollTo(0, 0);
      })
      .catch(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading artist...</div>;
  }

  return (
    <div>
      <div className="px-5 py-2.5 border-b border-[var(--border-color)] flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-[11px] font-mono text-[var(--text-muted)]">Artist #{id}</span>
      </div>

      <div className="px-5 py-4 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold m-0">{artist?.name || 'Artist'}</h2>
          <p className="text-xs text-[var(--text-secondary)] m-0 mt-0.5 font-mono">
            {albums.length} {albums.length === 1 ? 'album' : 'albums'} (including compilations)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => addArtistToQueue(id, true)}
            className="px-3 py-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Play size={14} /> Play All Tracks
          </button>
          <button
            type="button"
            onClick={() => addArtistToQueue(id, false)}
            className="px-3 py-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} /> Add All to Queue
          </button>
        </div>
      </div>

      <div>
        {albums.map((album, i) => (
          <AlbumRow
            key={album.id}
            album={album}
            index={i + 1}
            totalCount={albums.length}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 5. Folders View (/folders)
 */
export function FoldersView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { displayMode, openContextMenu, addFolderToQueue } = useApp();
  const isCompact = displayMode === 'compact';
  const currentPathParam = searchParams.get('path') || '';

  const [folderData, setFolderData] = useState({ currentPath: '', rootPath: '', folders: [], albums: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/folders/browse?path=${encodeURIComponent(currentPathParam)}`)
      .then(r => r.json())
      .then(res => {
        if (active) {
          setFolderData({
            currentPath: res.currentPath || '',
            rootPath: res.rootPath || '',
            folders: res.folders || [],
            albums: res.albums || []
          });
          setLoading(false);
        }
      })
      .catch(() => active && setLoading(false));
    return () => { active = false; };
  }, [currentPathParam]);

  const browseTo = (targetPath) => {
    setSearchParams(targetPath ? { path: targetPath } : {});
    window.scrollTo(0, 0);
  };

  const parts = (folderData.currentPath || '').split('/').filter(Boolean);
  const canGoUp = parts.length > 1 && folderData.currentPath !== folderData.rootPath;
  const parentPath = canGoUp ? '/' + parts.slice(0, -1).join('/') : '';
  const totalItems = folderData.folders.length + folderData.albums.length;

  return (
    <div>
      {/* Path Header */}
      <div className="px-5 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-xs px-2.5 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-primary)] truncate max-w-full">
          📁 {folderData.currentPath || '/'}
        </div>
        {folderData.currentPath && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => addFolderToQueue(folderData.currentPath, false)}
              className="px-2.5 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus size={13} /> Queue This Folder
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading folder contents...</div>
      ) : (
        <div>
          {canGoUp && (
            <div
              onClick={() => browseTo(parentPath)}
              className={`flex items-center gap-3 border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)] cursor-pointer font-semibold text-[var(--accent)] ${
                isCompact ? 'py-1.5 px-4 text-xs' : 'py-2.5 px-5 text-sm'
              }`}
            >
              <div className="w-12 shrink-0" />
              <div className="w-20 shrink-0 font-mono text-xs text-[var(--text-secondary)]">..</div>
              <div className="flex items-center gap-2">
                <CornerLeftUp size={15} />
                <span>.. (Go Up to Parent Directory)</span>
              </div>
            </div>
          )}

          {folderData.folders.map((f, i) => (
            <div
              key={f.path}
              onClick={() => browseTo(f.path)}
              onContextMenu={(e) => openContextMenu(e, 'folder', { path: f.path, name: f.name })}
              className={`group flex items-center gap-3 border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors ${
                isCompact ? 'py-1.5 px-4 text-xs' : 'py-2.5 px-5 text-sm'
              }`}
            >
              <div className="w-12 shrink-0 font-mono text-[11px] text-[var(--text-muted)]">DIR</div>
              <div className="w-20 shrink-0 font-mono text-xs text-[var(--text-secondary)]">
                {i + 1} / {totalItems}
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-2 font-medium">
                <Folder size={15} className="text-[var(--accent)] shrink-0" />
                <span className="truncate">{f.name}</span>
              </div>
              <button
                type="button"
                onClick={(e) => openContextMenu(e, 'folder', { path: f.path, name: f.name })}
                className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-opacity"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          ))}

          {folderData.albums.map((album, i) => (
            <AlbumRow
              key={album.id}
              album={album}
              index={folderData.folders.length + i + 1}
              totalCount={totalItems}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 6. Playlists View (/playlists) & Playlist Detail View (/playlists/:id)
 */
export function PlaylistsView() {
  const navigate = useNavigate();
  const {
    playlists,
    viewFilters,
    displayMode,
    openContextMenu,
    setPlaylistModal
  } = useApp();
  const isCompact = displayMode === 'compact';
  const search = (viewFilters.playlists?.search || '').toLowerCase();
  const filtered = playlists.filter(p => p.name.toLowerCase().includes(search));

  return (
    <div>
      <div className="px-5 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex items-center justify-between">
        <span className="text-xs font-mono text-[var(--text-secondary)]">
          {filtered.length} {filtered.length === 1 ? 'playlist' : 'playlists'}
        </span>
        <button
          type="button"
          onClick={() => setPlaylistModal({ open: true, trackIds: [] })}
          className="px-3 py-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <Plus size={14} /> New Playlist
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">No playlists found.</div>
      ) : (
        filtered.map((p, i) => (
          <div
            key={p.id}
            onClick={() => navigate(`/playlists/${p.id}`)}
            onContextMenu={(e) => openContextMenu(e, 'playlist', { id: p.id, name: p.name })}
            className={`group flex items-center gap-3 border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors ${
              isCompact ? 'py-1.5 px-4 text-xs' : 'py-2.5 px-5 text-sm'
            }`}
          >
            <div className="w-12 shrink-0 font-mono text-[11px] text-[var(--text-muted)]">#{p.id}</div>
            <div className="w-20 shrink-0 font-mono text-xs text-[var(--text-secondary)]">
              {i + 1} / {filtered.length}
            </div>
            <div className="flex-1 min-w-0 font-semibold truncate">{p.name}</div>
            <div className="w-28 shrink-0 text-right font-mono text-xs text-[var(--text-secondary)]">
              {p.track_count} tracks
            </div>
            <button
              type="button"
              onClick={(e) => openContextMenu(e, 'playlist', { id: p.id, name: p.name })}
              className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-opacity"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

export function PlaylistDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addPlaylistToQueue, deletePlaylist, loadPlaylists } = useApp();
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPlaylistDetail = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/playlists/${id}`).then(r => (r.ok ? r.json() : null)),
      fetch(`/api/playlists/${id}/tracks`).then(r => (r.ok ? r.json() : []))
    ])
      .then(([pData, tData]) => {
        setPlaylist(pData);
        setTracks(Array.isArray(tData) ? tData : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchPlaylistDetail();
  }, [fetchPlaylistDetail]);

  const handleRemoveTrack = async (playlistTrackId) => {
    await fetch(`/api/playlists/${id}/tracks/${playlistTrackId}`, { method: 'DELETE' });
    await loadPlaylists();
    fetchPlaylistDetail();
  };

  const handleDeletePlaylist = async () => {
    await deletePlaylist(id, playlist?.name);
    navigate('/playlists');
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading playlist...</div>;
  }

  const totalSeconds = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);

  return (
    <div>
      <div className="px-5 py-2.5 border-b border-[var(--border-color)] flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/playlists')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
        >
          <ArrowLeft size={14} /> Back to Playlists
        </button>
      </div>

      <div className="px-5 py-4 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold m-0">{playlist?.name || 'Playlist'}</h2>
          <p className="text-xs text-[var(--text-secondary)] m-0 mt-0.5 font-mono">
            {tracks.length} tracks • {formatTotalDuration(totalSeconds)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => addPlaylistToQueue(id, true)}
            disabled={tracks.length === 0}
            className="px-3 py-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            <Play size={14} /> Play All
          </button>
          <button
            type="button"
            onClick={() => addPlaylistToQueue(id, false)}
            disabled={tracks.length === 0}
            className="px-3 py-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            <Plus size={14} /> Add to Queue
          </button>
          <button
            type="button"
            onClick={handleDeletePlaylist}
            className="px-3 py-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--danger)] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">This playlist has no tracks yet.</div>
      ) : (
        tracks.map((track, idx) => (
          <TrackRow
            key={track.playlist_track_id || `${track.id}-${idx}`}
            track={track}
            index={idx + 1}
            showAlbumBadge
            onRemove={() => handleRemoveTrack(track.playlist_track_id)}
          />
        ))
      )}
    </div>
  );
}

/**
 * 7. Random View (/random)
 */
export function RandomView() {
  const { viewFilters } = useApp();
  const genre = viewFilters.random?.genre || '';
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadRandom = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '20' });
    if (genre) params.set('genre', genre);
    fetch(`/api/random?${params.toString()}`)
      .then(r => r.json())
      .then(res => {
        setAlbums(res.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [genre]);

  useEffect(() => {
    loadRandom();
  }, [loadRandom]);

  return (
    <div>
      <div className="px-5 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex items-center justify-between">
        <span className="text-xs font-mono text-[var(--text-secondary)]">
          20 randomly selected albums
        </span>
        <button
          type="button"
          onClick={loadRandom}
          className="px-3 py-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw size={13} /> Refresh Random
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">Selecting random albums...</div>
      ) : (
        albums.map((album, i) => (
          <AlbumRow
            key={album.id}
            album={album}
            index={i + 1}
            totalCount={albums.length}
          />
        ))
      )}
    </div>
  );
}

/**
 * 8. Autogen View (/autogen)
 */
export function AutogenView() {
  const { addTracksToQueue, playTracksNow, setPlaylistModal } = useApp();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAutogen = useCallback(() => {
    setLoading(true);
    fetch('/api/autogen-playlist')
      .then(r => r.json())
      .then(res => {
        setTracks(Array.isArray(res) ? res : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAutogen();
  }, [loadAutogen]);

  const trackIds = tracks.map(t => t.id);

  return (
    <div>
      <div className="px-5 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--accent)]" />
          <div>
            <h2 className="text-sm font-bold m-0">FAISS Autogen Playlist</h2>
            <p className="text-[11px] text-[var(--text-secondary)] m-0">
              {tracks.length} tracks generated by audio vector similarity with folder dispersion
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={tracks.length === 0}
            onClick={() => playTracksNow(trackIds)}
            className="px-3 py-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            <Play size={13} /> Play Now
          </button>
          <button
            type="button"
            onClick={loadAutogen}
            className="px-3 py-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={13} /> Refresh Autogen
          </button>
          <button
            type="button"
            disabled={tracks.length === 0}
            onClick={() => addTracksToQueue(trackIds, false)}
            className="px-3 py-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            <Plus size={13} /> Add to Queue
          </button>
          <button
            type="button"
            disabled={tracks.length === 0}
            onClick={() => setPlaylistModal({ open: true, trackIds })}
            className="px-3 py-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            <Save size={13} /> Save to Playlist
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">Generating similarity playlist...</div>
      ) : tracks.length === 0 ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">
          FAISS index is still initializing or no vectors available. Try refreshing in a moment.
        </div>
      ) : (
        tracks.map((track, idx) => (
          <TrackRow
            key={`${track.id}-${idx}`}
            track={track}
            index={idx + 1}
            showAlbumBadge
          />
        ))
      )}
    </div>
  );
}

/**
 * 9. History View (/history)
 */
export function HistoryView() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/history?limit=100')
      .then(r => r.json())
      .then(res => {
        setHistory(Array.isArray(res) ? res : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="px-5 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
        <h2 className="text-sm font-bold m-0">Playback History</h2>
        <p className="text-[11px] text-[var(--text-secondary)] m-0">
          Last 100 tracks played to completion
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading playback history...</div>
      ) : history.length === 0 ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">No playback history yet.</div>
      ) : (
        history.map((item, idx) => (
          <TrackRow
            key={item.history_id || `${item.id}-${idx}`}
            track={item}
            index={idx + 1}
            showAlbumBadge
            playedAt={item.played_at}
          />
        ))
      )}
    </div>
  );
}

/**
 * 10. Settings View (/settings)
 */
export function SettingsView() {
  const {
    theme,
    setTheme,
    displayMode,
    setDisplayMode,
    isAutoplay,
    setIsAutoplay
  } = useApp();

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-lg font-bold mt-0 mb-1">Settings</h2>
      <p className="text-xs text-[var(--text-secondary)] mt-0 mb-6">
        Customize appearance, list density, and FAISS continuous autoplay.
      </p>

      <div className="flex flex-col gap-5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Color Theme</div>
            <div className="text-xs text-[var(--text-secondary)]">
              Switch between Light, Dark, pure black OLED, or warm Sepia
            </div>
          </div>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="px-3 py-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-xs font-medium cursor-pointer"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="oled">OLED (Pure Black)</option>
            <option value="sepia">Sepia</option>
          </select>
        </div>

        <div className="border-t border-[var(--border-color)] pt-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Display Density</div>
            <div className="text-xs text-[var(--text-secondary)]">
              Adjust row padding for high-density text browsing
            </div>
          </div>
          <select
            value={displayMode}
            onChange={(e) => setDisplayMode(e.target.value)}
            className="px-3 py-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-xs font-medium cursor-pointer"
          >
            <option value="normal">Normal</option>
            <option value="compact">Compact</option>
          </select>
        </div>

        <div className="border-t border-[var(--border-color)] pt-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Autoplay (FAISS Vector Similarity)</div>
            <div className="text-xs text-[var(--text-secondary)]">
              Automatically append 5 similar tracks when the queue reaches the end
            </div>
          </div>
          <select
            value={isAutoplay ? 'on' : 'off'}
            onChange={(e) => setIsAutoplay(e.target.value === 'on')}
            className="px-3 py-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-xs font-medium cursor-pointer"
          >
            <option value="off">OFF</option>
            <option value="on">ON</option>
          </select>
        </div>
      </div>

      {/* Keyboard Shortcuts Reference */}
      <div className="mt-6 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5">
        <h3 className="text-sm font-bold mt-0 mb-3">Keyboard Shortcuts</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between py-1 border-b border-[var(--border-color)]">
            <span className="text-[var(--text-secondary)]">Play / Pause</span>
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)]">Space</kbd>
          </div>
          <div className="flex justify-between py-1 border-b border-[var(--border-color)]">
            <span className="text-[var(--text-secondary)]">Toggle Queue Drawer</span>
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)]">q</kbd>
          </div>
          <div className="flex justify-between py-1 border-b border-[var(--border-color)]">
            <span className="text-[var(--text-secondary)]">Clear Play Queue</span>
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)]">c</kbd>
          </div>
          <div className="flex justify-between py-1 border-b border-[var(--border-color)]">
            <span className="text-[var(--text-secondary)]">Next Track</span>
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)]">l / n</kbd>
          </div>
          <div className="flex justify-between py-1 border-b border-[var(--border-color)]">
            <span className="text-[var(--text-secondary)]">Previous Track</span>
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)]">h / p</kbd>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-[var(--text-secondary)]">Volume Up (+5%)</span>
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)]">k</kbd>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-[var(--text-secondary)]">Volume Down (-5%)</span>
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)]">j</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
