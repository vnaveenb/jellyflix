import React, { useState, useEffect } from 'react'
import type { JellyfinItem } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'
import { useAuth } from '../context/AuthContext'
import { MediaCard } from '../components/MediaCard'
import { Heart } from 'lucide-react'

interface MyListPageProps {
  onPlay: (item: JellyfinItem) => void
  onMoreInfo: (item: JellyfinItem) => void
  onToggleFavorite: (item: JellyfinItem) => void
}

export const MyListPage: React.FC<MyListPageProps> = ({ onPlay, onMoreInfo, onToggleFavorite }) => {
  const { user } = useAuth()
  const [favorites, setFavorites] = useState<JellyfinItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const loadFavorites = async () => {
      setIsLoading(true)
      try {
        const res = await jellyfinApi.getItems(user.Id, {
          isFavorite: true,
          includeItemTypes: 'Movie,Series',
          limit: 100,
        })
        setFavorites(res.Items || [])
      } catch (err) {
        console.error('Failed to load favorites:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadFavorites()
  }, [user])

  const handleFavoriteChange = (item: JellyfinItem) => {
    onToggleFavorite(item)
    setFavorites((prev) => prev.filter((i) => i.Id !== item.Id))
  }

  return (
    <div style={{ padding: '90px 4% 60px 4%' }}>
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: 0.5 }}>My List</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: 6 }}>
          Your saved movies and TV shows
        </p>
      </div>

      {isLoading ? (
        <div className="loading-spinner" />
      ) : favorites.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '80px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            color: '#888',
          }}
        >
          <Heart size={48} color="#444" />
          <p style={{ fontSize: '1.1rem' }}>You haven't added any titles to your list yet.</p>
          <span style={{ fontSize: '0.9rem', color: '#666' }}>
            Click the heart icon on any movie or TV show to save it here.
          </span>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 20,
          }}
        >
          {favorites.map((item) => (
            <MediaCard
              key={item.Id}
              item={item}
              portrait={true}
              onPlay={onPlay}
              onMoreInfo={onMoreInfo}
              onToggleFavorite={handleFavoriteChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}
