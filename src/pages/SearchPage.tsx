import React, { useState, useEffect } from 'react'
import type { JellyfinItem } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'
import { useAuth } from '../context/AuthContext'
import { MediaCard } from '../components/MediaCard'
import { Search } from 'lucide-react'

interface SearchPageProps {
  searchQuery: string
  onPlay: (item: JellyfinItem) => void
  onMoreInfo: (item: JellyfinItem) => void
  onToggleFavorite: (item: JellyfinItem) => void
}

export const SearchPage: React.FC<SearchPageProps> = ({
  searchQuery,
  onPlay,
  onMoreInfo,
  onToggleFavorite,
}) => {
  const { user } = useAuth()
  const [results, setResults] = useState<JellyfinItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!user || !searchQuery.trim()) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const res = await jellyfinApi.getItems(user.Id, {
          searchTerm: searchQuery.trim(),
          includeItemTypes: 'Movie,Series,Episode',
          limit: 48,
        })
        setResults(res.Items || [])
      } catch (err) {
        console.error('Search query failed:', err)
      } finally {
        setIsLoading(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [searchQuery, user])

  return (
    <div style={{ padding: '90px 4% 60px 4%' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700 }}>
          {searchQuery ? `Search Results for "${searchQuery}"` : 'Search Jellyfin'}
        </h1>
      </div>

      {isLoading ? (
        <div className="loading-spinner" />
      ) : searchQuery && results.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '80px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            color: '#888',
          }}
        >
          <Search size={44} color="#555" />
          <p style={{ fontSize: '1.1rem' }}>No matches found for "{searchQuery}".</p>
          <span style={{ fontSize: '0.9rem', color: '#666' }}>
            Try searching for movie titles, TV shows, actors, or genres.
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
          {results.map((item) => (
            <MediaCard
              key={item.Id}
              item={item}
              portrait={true}
              onPlay={onPlay}
              onMoreInfo={onMoreInfo}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  )
}
