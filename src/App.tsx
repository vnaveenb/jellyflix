import React, { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import type { JellyfinItem } from './types/jellyfin'
import { jellyfinApi } from './api/jellyfin'
import { Navbar } from './components/Navbar'
import { MobileBottomNav } from './components/MobileBottomNav'
import { InstallPwaBanner } from './components/InstallPwaBanner'
import { DetailModal } from './components/DetailModal'
import { VideoPlayer } from './components/VideoPlayer'
import { ProfilePicker } from './components/ProfilePicker'
import { LoginModal } from './components/LoginModal'
import { ServerConfigModal } from './components/ServerConfigModal'
import { HomePage } from './pages/HomePage'
import { MoviesPage } from './pages/MoviesPage'
import { SeriesPage } from './pages/SeriesPage'
import { MyListPage } from './pages/MyListPage'
import { SearchPage } from './pages/SearchPage'
import { DownloadsPage } from './pages/DownloadsPage'
import { OfflineProvider, useOffline } from './context/OfflineContext'
import { useKeyboardNav } from './hooks/useKeyboardNav'
import { usePWA } from './hooks/usePWA'
import { fuzzySearch } from './services/fuzzySearch'

const MainApp: React.FC = () => {
  const { user, isLoading } = useAuth()
  const { isInstalled, installApp } = usePWA()
  const { isOfflineMode, toggleOfflineMode, isNetworkOnline } = useOffline()
  const [activeTab, setActiveTab] = useState<'home' | 'series' | 'movies' | 'latest' | 'mylist' | 'search' | 'downloads'>('home')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMediaItem, setActiveMediaItem] = useState<JellyfinItem | null>(null)
  const [isOfflinePlayback, setIsOfflinePlayback] = useState(false)
  const [detailModalItem, setDetailModalItem] = useState<JellyfinItem | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showServerModal, setShowServerModal] = useState(false)
  const [profileConfirmed, setProfileConfirmed] = useState(false)

  // Warm up fuzzy search index when user is authenticated
  useEffect(() => {
    if (user) {
      fuzzySearch.init(user.Id)
    }
  }, [user])

  // Keyboard navigation for TV remote / 10-foot UI
  useKeyboardNav({
    onBack: () => {
      if (activeMediaItem) {
        setActiveMediaItem(null)
      } else if (detailModalItem) {
        setDetailModalItem(null)
      } else if (showLoginModal) {
        setShowLoginModal(false)
      } else if (showServerModal) {
        setShowServerModal(false)
      } else if (activeTab !== 'home') {
        setActiveTab('home')
      }
    },
    enabled: true,
  })

  const handlePlay = async (item: JellyfinItem, isOffline: boolean = false) => {
    setDetailModalItem(null)
    setIsOfflinePlayback(!!isOffline)
    if (!isOffline && (item.Type === 'Series' || item.Type === 'Season' || item.IsFolder)) {
      if (user) {
        try {
          const seriesId = item.Type === 'Series' ? item.Id : (item.SeriesId || item.Id)
          // 1. Try to resume next unwatched episode
          const nextUp = await jellyfinApi.getNextUp(user.Id, seriesId)
          if (nextUp?.Items && nextUp.Items.length > 0) {
            setActiveMediaItem(nextUp.Items[0])
            return
          }
          // 2. Otherwise get first episode of series or season
          const seasonId = item.Type === 'Season' ? item.Id : undefined
          const eps = await jellyfinApi.getEpisodes(seriesId, seasonId, user.Id)
          if (eps?.Items && eps.Items.length > 0) {
            setActiveMediaItem(eps.Items[0])
            return
          }
        } catch (err) {
          console.warn('Failed to resolve episode for series play:', err)
        }
      }
    }
    setActiveMediaItem(item)
  }

  const handleMoreInfo = (item: JellyfinItem) => {
    setDetailModalItem(item)
  }

  const handleToggleFavorite = async (item: JellyfinItem) => {
    if (!user) return
    const currentFav = !!item.UserData?.IsFavorite
    const nextFav = !currentFav

    if (item.UserData) {
      item.UserData.IsFavorite = nextFav
    }

    try {
      await jellyfinApi.setFavorite(user.Id, item.Id, nextFav)
    } catch (err) {
      console.error('Failed to update favorite:', err)
    }
  }

  const handleToggleWatched = async (item: JellyfinItem) => {
    if (!user) return
    const currentPlayed = !!item.UserData?.Played
    const nextPlayed = !currentPlayed

    if (item.UserData) {
      item.UserData.Played = nextPlayed
    }

    try {
      await jellyfinApi.markPlayed(user.Id, item.Id, nextPlayed)
    } catch (err) {
      console.error('Failed to update watched status:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="profile-screen">
        <div className="brand-logo" style={{ marginBottom: 20 }}>
          <span>JELLYFLIX</span>
          <span className="brand-badge">OMV</span>
        </div>
        <div className="loading-spinner" />
      </div>
    )
  }

  // If user is not logged in or offline without server, bypass to Downloads
  if (!user || !profileConfirmed) {
    if (isOfflineMode || !isNetworkOnline) {
      return (
        <div className="app-container">
          <DownloadsPage onPlay={(item) => handlePlay(item, true)} onMoreInfo={handleMoreInfo} />
          {activeMediaItem && (
            <VideoPlayer
              item={activeMediaItem}
              onClose={() => {
                setActiveMediaItem(null)
                setIsOfflinePlayback(false)
              }}
              onToggleFavorite={handleToggleFavorite}
              isOffline={true}
            />
          )}
        </div>
      )
    }
    return (
      <>
        <ProfilePicker
          onSelectUser={() => setProfileConfirmed(true)}
          onOpenLogin={() => setShowLoginModal(true)}
          onOpenServerSettings={() => setShowServerModal(true)}
        />

        {showLoginModal && (
          <LoginModal
            onClose={() => setShowLoginModal(false)}
            onSuccess={() => {
              setShowLoginModal(false)
              setProfileConfirmed(true)
            }}
          />
        )}

        {showServerModal && (
          <ServerConfigModal onClose={() => setShowServerModal(false)} />
        )}
      </>
    )
  }

  return (
    <div className="app-container">
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab as any)
          if (tab !== 'search') setSearchQuery('')
        }}
        onOpenSearch={() => setActiveTab('search')}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSwitchProfile={() => setProfileConfirmed(false)}
        onOpenServerSettings={() => setShowServerModal(true)}
      />

      {/* Offline Mode Alert Banner */}
      {isOfflineMode && (
        <div style={{
          background: '#E50914',
          color: '#fff',
          padding: '8px 16px',
          textAlign: 'center',
          fontSize: '0.85rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}>
          <span>Offline Mode Active — Only downloaded content is shown</span>
          <button
            onClick={toggleOfflineMode}
            style={{
              background: '#fff',
              color: '#E50914',
              border: 'none',
              borderRadius: 12,
              padding: '2px 10px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Go Online
          </button>
        </div>
      )}

      <main style={{ flex: 1, paddingBottom: '70px' }}>
        {(isOfflineMode || activeTab === 'downloads') && (
          <DownloadsPage
            onPlay={(item) => handlePlay(item, true)}
            onMoreInfo={handleMoreInfo}
          />
        )}

        {!isOfflineMode && activeTab === 'home' && (
          <HomePage
            onPlay={handlePlay}
            onMoreInfo={handleMoreInfo}
            onToggleFavorite={handleToggleFavorite}
            onToggleWatched={handleToggleWatched}
          />
        )}

        {!isOfflineMode && activeTab === 'movies' && (
          <MoviesPage
            onPlay={handlePlay}
            onMoreInfo={handleMoreInfo}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {!isOfflineMode && activeTab === 'series' && (
          <SeriesPage
            onPlay={handlePlay}
            onMoreInfo={handleMoreInfo}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {!isOfflineMode && activeTab === 'latest' && (
          <HomePage
            onPlay={handlePlay}
            onMoreInfo={handleMoreInfo}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {!isOfflineMode && activeTab === 'mylist' && (
          <MyListPage
            onPlay={handlePlay}
            onMoreInfo={handleMoreInfo}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {!isOfflineMode && activeTab === 'search' && (
          <SearchPage
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onPlay={handlePlay}
            onMoreInfo={handleMoreInfo}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab as any)
          if (tab !== 'search') setSearchQuery('')
        }}
        onOpenSearch={() => setActiveTab('search')}
        onOpenSettings={() => setShowServerModal(true)}
      />

      {/* Install PWA Prompt Banner for Mobile */}
      <InstallPwaBanner onInstall={installApp} isInstalled={isInstalled} />

      {/* Detail Modal ("More Info") */}
      {detailModalItem && (
        <DetailModal
          item={detailModalItem}
          onClose={() => setDetailModalItem(null)}
          onPlay={handlePlay}
          onToggleFavorite={handleToggleFavorite}
          onItemUpdated={(updated) => {
            setDetailModalItem(updated)
          }}
          onItemDeleted={() => {
            setDetailModalItem(null)
          }}
        />
      )}

      {/* Fullscreen / YouTube-Style Video Player */}
      {activeMediaItem && (
        <VideoPlayer
          item={activeMediaItem}
          onClose={() => {
            setActiveMediaItem(null)
            setIsOfflinePlayback(false)
          }}
          onToggleFavorite={handleToggleFavorite}
          isOffline={isOfflinePlayback}
        />
      )}

      {/* Server Config Modal */}
      {showServerModal && (
        <ServerConfigModal onClose={() => setShowServerModal(false)} />
      )}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <OfflineProvider>
        <MainApp />
      </OfflineProvider>
    </AuthProvider>
  )
}
