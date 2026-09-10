import React from 'react'
import { Home, Tv, Film, Search, Bookmark, Settings } from 'lucide-react'

interface MobileBottomNavProps {
  activeTab: string
  setActiveTab: (tab: string) => void
  onOpenSearch: () => void
  onOpenSettings: () => void
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  onOpenSearch,
  onOpenSettings,
}) => {
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
        className={`mobile-nav-item ${activeTab === 'mylist' ? 'active' : ''}`}
        onClick={() => setActiveTab('mylist')}
      >
        <Bookmark size={20} />
        <span>My List</span>
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
        onClick={onOpenSettings}
        title="Settings & Servers"
      >
        <Settings size={20} />
        <span>Settings</span>
      </button>
    </nav>
  )
}
