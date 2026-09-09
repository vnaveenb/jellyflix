import React, { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import type { JellyfinItem } from './types/jellyfin'
import { jellyfinApi } from './api/jellyfin'
import { Navbar } from './components/Navbar'
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
import { useKeyboardNav } from './hooks/useKeyboardNav'

const MainApp: React.FC = () => {
  const { user, isLoading } = useAuth()
  const [activeTab, setActiveTab] = useState<'home' | 'series' | 'movies' | 'latest' | 'mylist' | 'search'>('home')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMediaItem, setActiveMediaItem] = useState<JellyfinItem | null>(null)
  const [detailModalItem, setDetailModalItem] = useState<JellyfinItem | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showServerModal, setShowServerModal] = useState(false)
  const [profileConfirmed, setProfileConfirmed] = useState(false)

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

  const handlePlay = (item: JellyfinItem) => {
    setDetailModalItem(null)
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

  // If no user or profile not confirmed yet, show "Who's watching?"
  if (!user || !profileConfirmed) {
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

      <main style={{ flex: 1 }}>
        {activeTab === 'home' && (
          <HomePage
            onPlay={handlePlay}
            onMoreInfo={handleMoreInfo}
            onToggleFavorite={handleToggleFavorite}
            onToggleWatched={handleToggleWatched}
          />
        )}

        {activeTab === 'movies' && (
          <MoviesPage
            onPlay={handlePlay}
            onMoreInfo={handleMoreInfo}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {activeTab === 'series' && (
          <SeriesPage
            onPlay={handlePlay}
            onMoreInfo={handleMoreInfo}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {activeTab === 'latest' && (
          <HomePage
            onPlay={handlePlay}
            onMoreInfo={handleMoreInfo}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {activeTab === 'mylist' && (
          <MyListPage
            onPlay={handlePlay}
            onMoreInfo={handleMoreInfo}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {activeTab === 'search' && (
          <SearchPage
            searchQuery={searchQuery}
            onPlay={handlePlay}
            onMoreInfo={handleMoreInfo}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </main>

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

      {/* Fullscreen Video Player */}
      {activeMediaItem && (
        <VideoPlayer
          item={activeMediaItem}
          onClose={() => setActiveMediaItem(null)}
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
      <MainApp />
    </AuthProvider>
  )
}
