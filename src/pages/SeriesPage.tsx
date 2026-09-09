import React, { useState, useEffect } from 'react'
import type { JellyfinItem } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'
import { useAuth } from '../context/AuthContext'
import { MediaCard } from '../components/MediaCard'

interface SeriesPageProps {
  onPlay: (item: JellyfinItem) => void
  onMoreInfo: (item: JellyfinItem) => void
  onToggleFavorite: (item: JellyfinItem) => void
}

export const SeriesPage: React.FC<SeriesPageProps> = ({ onPlay, onMoreInfo, onToggleFavorite }) => {
  const { user } = useAuth()
  const [series, setSeries] = useState<JellyfinItem[]>([])
  const [sortBy, setSortBy] = useState('DateCreated')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const loadSeries = async () => {
      setIsLoading(true)
      try {
        const res = await jellyfinApi.getItems(user.Id, {
          includeItemTypes: 'Series',
          sortBy: sortBy,
          sortOrder: sortBy === 'SortName' ? 'Ascending' : 'Descending',
          limit: 60,
        })
        setSeries(res.Items || [])
      } catch (err) {
        console.error('Failed to load series:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadSeries()
  }, [user, sortBy])

  return (
    <div style={{ padding: '90px 4% 60px 4%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 30,
        }}
      >
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: 0.5 }}>TV Shows</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Sort by:</span>
          <select
            className="season-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="DateCreated">Recently Added</option>
            <option value="CommunityRating">Highest Rated</option>
            <option value="PremiereDate">Release Date</option>
            <option value="SortName">Alphabetical</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-spinner" />
      ) : series.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#888' }}>
          No TV shows found in your Jellyfin library.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 20,
          }}
        >
          {series.map((item) => (
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
