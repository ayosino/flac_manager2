import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useApp } from './context/AppContext';
import {
  AlbumsView,
  AlbumDetailView,
  ArtistsView,
  ArtistDetailView,
  FoldersView,
  PlaylistsView,
  PlaylistDetailView,
  RandomView,
  AutogenView,
  HistoryView,
  SettingsView
} from './views/Views';
import {
  PlayerBar,
  QueueDrawer,
  ContextMenu,
  CreatePlaylistModal,
  CoverLightbox,
  ToastContainer
} from './components/PlayerAndOverlays';

const TABS = [
  { id: 'albums', label: 'Albums', path: '/albums' },
  { id: 'artists', label: 'Artists', path: '/artists' },
  { id: 'folders', label: 'Folders', path: '/folders' },
  { id: 'playlists', label: 'Playlists', path: '/playlists' },
  { id: 'random', label: 'Random', path: '/random' },
  { id: 'autogen', label: 'Autogen', path: '/autogen' },
  { id: 'history', label: 'History', path: '/history' },
  { id: 'settings', label: 'Settings', path: '/settings' }
];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { viewFilters, setViewFilters } = useApp();

  // Determine active top-level tab from URL path
  const activeTab = TABS.find(t => location.pathname.startsWith(t.path))?.id || 'albums';

  const supportsSearch = activeTab === 'albums' || activeTab === 'artists' || activeTab === 'playlists';
  const supportsSort = activeTab === 'albums' || activeTab === 'artists';

  const currentSearch = viewFilters[activeTab]?.search || '';
  const currentSort = viewFilters[activeTab]?.sort || 'alpha';

  const [inputVal, setInputVal] = useState(currentSearch);
  const debounceRef = useRef(null);

  useEffect(() => {
    setInputVal(viewFilters[activeTab]?.search || '');
  }, [activeTab, viewFilters]);

  const handleSearchChange = (val) => {
    setInputVal(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!supportsSearch) return;
      setViewFilters(prev => ({
        ...prev,
        [activeTab]: {
          ...prev[activeTab],
          search: val,
          ...(prev[activeTab]?.page ? { page: 1 } : {})
        }
      }));
      // If user is on a detail page (/albums/:id or /artists/:id) and starts typing in search, navigate to the list view
      if (activeTab === 'albums' && location.pathname !== '/albums') {
        navigate('/albums');
      } else if (activeTab === 'artists' && location.pathname !== '/artists') {
        navigate('/artists');
      }
    }, 300);
  };

  const handleSortChange = (val) => {
    if (!supportsSort) return;
    setViewFilters(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        sort: val,
        page: 1
      }
    }));
  };

  return (
    <div className="min-h-screen pb-[84px] bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-30 h-12 px-5 bg-[var(--bg-primary)] border-b border-[var(--border-color)] flex items-center justify-between gap-4">
        <h1
          onClick={() => navigate('/albums')}
          className="text-base font-bold m-0 tracking-tight cursor-pointer hover:text-[var(--accent)] transition-colors"
        >
          Theatre of Eternal Music
        </h1>

        <div className="flex items-center gap-2.5">
          {supportsSort && (
            <select
              value={currentSort}
              onChange={(e) => handleSortChange(e.target.value)}
              className="px-2.5 py-1 text-xs rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              <option value="alpha">A–Z</option>
              <option value="newest">Modified Date</option>
              <option value="added">Added Date</option>
              <option value="id_desc">ID (Newest)</option>
              <option value="id_asc">ID (Oldest)</option>
            </select>
          )}

          {supportsSearch && (
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-[var(--text-muted)] pointer-events-none" />
              <input
                type="text"
                value={inputVal}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={`Search ${activeTab}...`}
                className="w-48 sm:w-60 pl-7 pr-7 py-1 text-xs rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
              {inputVal && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Sticky 8-Tab Navigation Bar */}
      <nav className="sticky top-12 z-20 px-5 bg-[var(--bg-primary)] border-b border-[var(--border-color)] flex items-center gap-1 overflow-x-auto no-scrollbar">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate(tab.path)}
              className={`px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors shrink-0 cursor-pointer ${
                isActive
                  ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Main Content Container */}
      <main className="max-w-6xl mx-auto border-x border-[var(--border-color)] min-h-[calc(100vh-172px)]">
        <Routes>
          <Route path="/" element={<Navigate to="/albums" replace />} />
          <Route path="/albums" element={<AlbumsView />} />
          <Route path="/albums/:id" element={<AlbumDetailView />} />
          <Route path="/artists" element={<ArtistsView />} />
          <Route path="/artists/:id" element={<ArtistDetailView />} />
          <Route path="/folders" element={<FoldersView />} />
          <Route path="/playlists" element={<PlaylistsView />} />
          <Route path="/playlists/:id" element={<PlaylistDetailView />} />
          <Route path="/random" element={<RandomView />} />
          <Route path="/autogen" element={<AutogenView />} />
          <Route path="/history" element={<HistoryView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="*" element={<Navigate to="/albums" replace />} />
        </Routes>
      </main>

      {/* Persistent Player Bar & Overlays */}
      <QueueDrawer />
      <PlayerBar />
      <ContextMenu />
      <CreatePlaylistModal />
      <CoverLightbox />
      <ToastContainer />
    </div>
  );
}
