import React, { useState, useEffect, useRef } from 'react'
import { Search, Bell, User, Server, LogOut, Users, Download, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { jellyfinApi } from '../api/jellyfin'
import { usePWA } from '../hooks/usePWA'
import { InstallPwaModal } from './InstallPwaModal'

interface NavbarProps {
  activeTab: string
  setActiveTab: (tab: string) => void
  onOpenSearch: () => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  onSwitchProfile: () => void
  onOpenServerSettings: () => void
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenSearch,
  searchQuery,
  setSearchQuery,
  onSwitchProfile,
  onOpenServerSettings,
}) => {
  const { user, logout } = useAuth()
  const {
    isInstalled,
    installApp,
    showInstallModal,
    setShowInstallModal,
    hasNativePrompt,
    isIOS,
    isAndroid,
  } = usePWA()
  const [isScrolled, setIsScrolled] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSearchToggle = () => {
    if (window.innerWidth <= 768) {
      setMobileSearchOpen(!mobileSearchOpen)
      if (!mobileSearchOpen) {
        onOpenSearch()
        setTimeout(() => mobileInputRef.current?.focus(), 150)
      }
    } else {
      onOpenSearch()
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }

  const userAvatarUrl = user?.Id ? jellyfinApi.getUserImageUrl(user.Id, user.PrimaryImageTag) : null

  return (
    <>
      <header className={`navbar ${isScrolled ? 'scrolled' : 'transparent'}`}>
        <div className="navbar-left">
          <a href="#home" className="brand-logo" onClick={() => setActiveTab('home')}>
            <span>JELLYFLIX</span>
            <span className="brand-badge">OMV</span>
          </a>

          {/* Desktop Navigation Links (Hidden on Mobile) */}
          <nav className="desktop-nav">
            <ul className="nav-links">
              <li>
                <button
                  className={`nav-link ${activeTab === 'home' ? 'active' : ''}`}
                  onClick={() => setActiveTab('home')}
                >
                  Home
                </button>
              </li>
              <li>
                <button
                  className={`nav-link ${activeTab === 'series' ? 'active' : ''}`}
                  onClick={() => setActiveTab('series')}
                >
                  TV Shows
                </button>
              </li>
              <li>
                <button
                  className={`nav-link ${activeTab === 'movies' ? 'active' : ''}`}
                  onClick={() => setActiveTab('movies')}
                >
                  Movies
                </button>
              </li>
              <li>
                <button
                  className={`nav-link ${activeTab === 'latest' ? 'active' : ''}`}
                  onClick={() => setActiveTab('latest')}
                >
                  New & Popular
                </button>
              </li>
              <li>
                <button
                  className={`nav-link ${activeTab === 'mylist' ? 'active' : ''}`}
                  onClick={() => setActiveTab('mylist')}
                >
                  My List
                </button>
              </li>
            </ul>
          </nav>
        </div>

        <div className="navbar-right">
          {/* Desktop Search Bar */}
          <div className="search-container desktop-only-search">
            <Search size={18} className="search-icon" onClick={handleSearchToggle} />
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Titles, people, genres..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                if (activeTab !== 'search') onOpenSearch()
              }}
              onFocus={() => {
                if (activeTab !== 'search') onOpenSearch()
              }}
            />
          </div>

          {/* Mobile Search Icon Button */}
          <button
            className="mobile-search-btn"
            onClick={handleSearchToggle}
            aria-label="Search"
            title="Search"
          >
            <Search size={20} />
          </button>

          {/* Install PWA Button (Prominent on both Mobile and Desktop) */}
          {!isInstalled && (
            <button
              className="install-pwa-btn"
              onClick={installApp}
              title="Install JellyFlix App"
              aria-label="Install JellyFlix App"
            >
              <Download size={15} color="#E50914" />
              <span className="install-text">Install App</span>
            </button>
          )}

          {/* Notifications Icon (Desktop) */}
          <button className="player-btn desktop-only-notifications" title="Notifications" aria-label="Notifications">
            <Bell size={20} />
          </button>

          {/* User Profile Menu */}
          <div className="user-menu" ref={menuRef}>
            <button
              className="user-avatar-btn"
              onClick={() => setShowDropdown(!showDropdown)}
              title={user?.Name || 'User'}
              aria-label="User menu"
            >
              {userAvatarUrl ? (
                <img
                  src={userAvatarUrl}
                  alt={user?.Name}
                  className="avatar-img"
                  onError={(e) => {
                    ;(e.target as HTMLElement).style.display = 'none'
                  }}
                />
              ) : (
                <div className="avatar-img">
                  {user?.Name ? user.Name.charAt(0).toUpperCase() : <User size={18} />}
                </div>
              )}
            </button>

            {showDropdown && (
              <div className="dropdown-menu">
                <div className="dropdown-item" style={{ color: '#fff', fontWeight: 600 }}>
                  <User size={16} color="#E50914" />
                  <span>{user?.Name || 'Jellyfin User'}</span>
                </div>
                <div className="dropdown-divider" />
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setShowDropdown(false)
                    onSwitchProfile()
                  }}
                >
                  <Users size={16} />
                  <span>Switch Profile</span>
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setShowDropdown(false)
                    onOpenServerSettings()
                  }}
                >
                  <Server size={16} />
                  <span>Server Settings</span>
                </button>
                {!isInstalled && (
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setShowDropdown(false)
                      installApp()
                    }}
                  >
                    <Download size={16} color="#E50914" />
                    <span>Install JellyFlix App</span>
                  </button>
                )}
                <div className="dropdown-divider" />
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setShowDropdown(false)
                    logout()
                  }}
                >
                  <LogOut size={16} />
                  <span>Sign Out of JellyFlix</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Expandable Search Bar Overlay */}
      {mobileSearchOpen && (
        <div className="mobile-search-bar-drawer">
          <div className="mobile-search-input-wrap">
            <Search size={18} color="#aaa" />
            <input
              ref={mobileInputRef}
              type="text"
              placeholder="Search movies, TV shows, actors..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                if (activeTab !== 'search') onOpenSearch()
              }}
              autoFocus
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                <X size={16} />
              </button>
            )}
          </div>
          <button className="cancel-search-btn" onClick={() => setMobileSearchOpen(false)}>
            Done
          </button>
        </div>
      )}

      {/* Cross-Platform PWA Installation Guidance Modal */}
      <InstallPwaModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
        onInstallDirect={installApp}
        hasNativePrompt={hasNativePrompt}
        isIOS={isIOS}
        isAndroid={isAndroid}
      />
    </>
  )
}
