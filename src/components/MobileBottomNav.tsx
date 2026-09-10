import React from 'react'
import { Home, Tv, Film, Search, Download, User } from 'lucide-react'
import { useOffline } from '../context/OfflineContext'

interface MobileBottomNavProps {
  activeTab: string
  setActiveTab: (tab: string) => void
  onOpenSearch: () => void
  onOpenSettings: () => void
  onOpenAccount?: () => void
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  onOpenSearch,
  onOpenSettings,
  onOpenAccount,
}) => {
  const { downloads, activeDownloads } = useOffline()

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
      <button
        className={`mobile-nav-item ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => setActiveTab('home')}
      >
        <Home size={20} />
        <span>Home</span>
      </button>

      <button
        className={`mobile-nav-item ${activeTab === 'series' ? 'active' : ''}`}
        onClick={() => setActiveTab('series')}
      >
        <Tv size={20} />
        <span>Series</span>
      </button>

      <button
        className={`mobile-nav-item ${activeTab === 'movies' ? 'active' : ''}`}
        onClick={() => setActiveTab('movies')}
      >
        <Film size={20} />
        <span>Movies</span>
      </button>

      <button
        className={`mobile-nav-item ${activeTab === 'downloads' ? 'active' : ''}`}
        onClick={() => setActiveTab('downloads')}
        style={{ position: 'relative' }}
      >
        <Download size={20} />
        <span>Downloads</span>
        {activeDownloads.length > 0 ? (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 14,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#E50914',
            }}
          />
        ) : downloads.length > 0 ? (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 12,
              fontSize: '0.62rem',
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
              borderRadius: 8,
              padding: '0 4px',
            }}
          >
            {downloads.length}
          </span>
        ) : null}
      </button>

      <button
        className={`mobile-nav-item ${activeTab === 'search' ? 'active' : ''}`}
        onClick={onOpenSearch}
      >
        <Search size={20} />
        <span>Search</span>
      </button>

      <button
        className="mobile-nav-item"
        onClick={onOpenAccount || onOpenSettings}
        title="Account & Settings"
      >
        <User size={20} />
        <span>Account</span>
      </button>
    </nav>
  )
}
