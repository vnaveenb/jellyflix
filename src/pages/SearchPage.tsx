import React, { useState, useEffect, useMemo } from 'react'
import type { JellyfinItem } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'
import { useAuth } from '../context/AuthContext'
import { MediaCard } from '../components/MediaCard'
import { Search, Sparkles, Filter, ArrowUpDown } from 'lucide-react'
import { fuzzySearch } from '../services/fuzzySearch'

interface SearchPageProps {
  searchQuery: string
  setSearchQuery?: (query: string) => void
  onPlay: (item: JellyfinItem) => void
  onMoreInfo: (item: JellyfinItem) => void
  onToggleFavorite: (item: JellyfinItem) => void
}

const POPULAR_GENRES = [
  'Action',
  'Sci-Fi',
  'Comedy',
  'Drama',
  'Thriller',
  'Romance',
  'Crime',
  'Animation',
  'Horror',
  'Adventure',
]

export const SearchPage: React.FC<SearchPageProps> = ({
  searchQuery,
  setSearchQuery,
  onPlay,
  onMoreInfo,
  onToggleFavorite,
}) => {
  const { user } = useAuth()
  const [results, setResults] = useState<JellyfinItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState<'all' | 'Movie' | 'Series' | 'unwatched'>('all')
  const [sortBy, setSortBy] = useState<'relevance' | 'rating' | 'year' | 'name'>('relevance')
  const [typoSuggestion, setTypoSuggestion] = useState<string | null>(null)

  // Preload fuzzy search engine index
  useEffect(() => {
    if (user) {
      fuzzySearch.init(user.Id)
    }
  }, [user])

  // Real-time hybrid search (Fuzzy Memory Search + Jellyfin Server Search)
  useEffect(() => {
    if (!user || !searchQuery.trim()) {
      setResults([])
      setTypoSuggestion(null)
      return
    }

    const trimmed = searchQuery.trim().toLowerCase()

    // 1. Instant client-side fuzzy search (<5ms, handles typos, partials, sounds)
    const fuzzyMatches = fuzzySearch.search(trimmed, 60)
    const instantItems = fuzzyMatches.map((m) => m.item)

    // Check for typo suggestion if top match differs from typed text
    if (fuzzyMatches.length > 0 && fuzzyMatches[0].item.Name) {
      const topName = fuzzyMatches[0].item.Name.toLowerCase()
      if (
        topName !== trimmed &&
        !topName.startsWith(trimmed) &&
        (fuzzyMatches[0].score ?? 1) < 0.35
      ) {
        setTypoSuggestion(fuzzyMatches[0].item.Name)
      } else {
        setTypoSuggestion(null)
      }
    } else {
      setTypoSuggestion(null)
    }

    // Set initial instant fuzzy results immediately
    setResults(instantItems)

    // 2. Concurrently query Jellyfin server for exact matches or items not yet indexed
    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const res = await jellyfinApi.getItems(user.Id, {
          searchTerm: trimmed,
          includeItemTypes: 'Movie,Series,Episode',
          limit: 60,
        })
        const serverItems = res.Items || []

        // Merge results: exact server matches prioritized, supplemented with fuzzy typo matches
        const seenIds = new Set<string>()
        const combined: JellyfinItem[] = []

        // Add exact server matches first
        for (const it of serverItems) {
          if (!seenIds.has(it.Id)) {
            seenIds.add(it.Id)
            combined.push(it)
          }
        }

        // Add fuzzy matches
        for (const it of instantItems) {
          if (!seenIds.has(it.Id)) {
            seenIds.add(it.Id)
            combined.push(it)
          }
        }

        setResults(combined)
      } catch (err) {
        console.warn('Server search error (using fuzzy fallback):', err)
      } finally {
        setIsLoading(false)
      }
    }, 120)

    return () => clearTimeout(timer)
  }, [searchQuery, user])

  // Filter & Sort results
  const filteredResults = useMemo(() => {
    let list = [...results]

    if (activeFilter === 'Movie') {
      list = list.filter((i) => i.Type === 'Movie')
    } else if (activeFilter === 'Series') {
      list = list.filter((i) => i.Type === 'Series')
    } else if (activeFilter === 'unwatched') {
      list = list.filter((i) => !i.UserData?.Played)
    }

    if (sortBy === 'rating') {
      list.sort((a, b) => (b.CommunityRating || 0) - (a.CommunityRating || 0))
    } else if (sortBy === 'year') {
      list.sort((a, b) => (b.ProductionYear || 0) - (a.ProductionYear || 0))
    } else if (sortBy === 'name') {
      list.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''))
    }

    return list
  }, [results, activeFilter, sortBy])

  const movieCount = useMemo(() => results.filter((i) => i.Type === 'Movie').length, [results])
  const seriesCount = useMemo(() => results.filter((i) => i.Type === 'Series').length, [results])

  return (
    <div style={{ padding: '95px 4% 60px 4%' }}>
      {/* Search Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: '1.9rem', fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Search size={26} color="#E50914" />
              <span>{searchQuery ? `Search: "${searchQuery}"` : 'Explore & Search'}</span>
            </h1>
            {searchQuery && (
              <p style={{ fontSize: '0.9rem', color: '#888', marginTop: 4 }}>
                Found {results.length} title{results.length === 1 ? '' : 's'} across your Jellyfin libraries
              </p>
            )}
          </div>

          {/* Sort selector */}
          {searchQuery && results.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ArrowUpDown size={15} color="#888" />
              <select
                className="season-select"
                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="relevance">Sort: Relevance (Fuzzy Match)</option>
                <option value="rating">Sort: Highest Rated</option>
                <option value="year">Sort: Release Year (Newest)</option>
                <option value="name">Sort: Title (A-Z)</option>
              </select>
            </div>
          )}
        </div>

        {/* Typo Correction / Fuzzy Match Notification */}
        {typoSuggestion && setSearchQuery && (
          <div
            style={{
              marginTop: 14,
              padding: '8px 14px',
              background: 'rgba(229, 9, 20, 0.12)',
              border: '1px solid rgba(229, 9, 20, 0.3)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: '0.9rem',
              color: '#ddd',
            }}
          >
            <Sparkles size={16} color="#E50914" />
            <span>
              Typo-tolerant fuzzy search matched <strong>"{typoSuggestion}"</strong>.
            </span>
            <button
              onClick={() => setSearchQuery(typoSuggestion)}
              style={{
                background: 'none',
                border: 'none',
                color: '#E50914',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              Search exact "{typoSuggestion}"
            </button>
          </div>
        )}

        {/* Filter Chips */}
        {searchQuery && results.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              className={`search-filter-chip ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              All ({results.length})
            </button>
            {movieCount > 0 && (
              <button
                className={`search-filter-chip ${activeFilter === 'Movie' ? 'active' : ''}`}
                onClick={() => setActiveFilter('Movie')}
              >
                Movies ({movieCount})
              </button>
            )}
            {seriesCount > 0 && (
              <button
                className={`search-filter-chip ${activeFilter === 'Series' ? 'active' : ''}`}
                onClick={() => setActiveFilter('Series')}
              >
                TV Shows ({seriesCount})
              </button>
            )}
            <button
              className={`search-filter-chip ${activeFilter === 'unwatched' ? 'active' : ''}`}
              onClick={() => setActiveFilter('unwatched')}
            >
              Unwatched Only
            </button>
          </div>
        )}
      </div>

      {/* Empty State / Genre Explorer when no search query */}
      {!searchQuery.trim() ? (
        <div style={{ marginTop: 20 }}>
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, color: '#aaa', fontSize: '0.95rem' }}>
            <Filter size={16} />
            <span>Quick Browse by Genre:</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 40 }}>
            {POPULAR_GENRES.map((genre) => (
              <button
                key={genre}
                className="genre-tag-btn"
                onClick={() => setSearchQuery && setSearchQuery(genre)}
              >
                {genre}
              </button>
            ))}
          </div>

          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
            <Search size={48} color="#333" style={{ marginBottom: 14 }} />
            <h3 style={{ fontSize: '1.2rem', color: '#888', fontWeight: 600 }}>Start typing to search</h3>
            <p style={{ fontSize: '0.9rem', color: '#555', marginTop: 4 }}>
              Fuzzy search finds titles even with typos, alternate spellings, actors, or genres.
            </p>
          </div>
        </div>
      ) : isLoading && results.length === 0 ? (
        <div className="loading-spinner" />
      ) : filteredResults.length === 0 ? (
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
          <p style={{ fontSize: '1.15rem', fontWeight: 600, color: '#aaa' }}>
            No matches found for "{searchQuery}".
          </p>
          <span style={{ fontSize: '0.9rem', color: '#666', maxWidth: 450 }}>
            Try searching for a different keyword, popular actor, or select one of the genres below:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 10 }}>
            {POPULAR_GENRES.slice(0, 6).map((g) => (
              <button
                key={g}
                className="genre-tag-btn"
                onClick={() => setSearchQuery && setSearchQuery(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 20,
          }}
        >
          {filteredResults.map((item) => (
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
