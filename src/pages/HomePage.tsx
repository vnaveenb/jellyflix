import React, { useState, useEffect } from 'react'
import type { JellyfinItem } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'
import { useAuth } from '../context/AuthContext'
import { HeroBillboard } from '../components/HeroBillboard'
import { ContentRow } from '../components/ContentRow'

interface HomePageProps {
  onPlay: (item: JellyfinItem) => void
  onMoreInfo: (item: JellyfinItem) => void
  onToggleFavorite: (item: JellyfinItem) => void
}

export const HomePage: React.FC<HomePageProps> = ({ onPlay, onMoreInfo, onToggleFavorite }) => {
  const { user } = useAuth()
  const [featuredItem, setFeaturedItem] = useState<JellyfinItem | null>(null)
  const [continueWatching, setContinueWatching] = useState<JellyfinItem[]>([])
  const [latestMovies, setLatestMovies] = useState<JellyfinItem[]>([])
  const [latestShows, setLatestShows] = useState<JellyfinItem[]>([])
  const [topRated, setTopRated] = useState<JellyfinItem[]>([])
  const [actionMovies, setActionMovies] = useState<JellyfinItem[]>([])
  const [comedyMedia, setComedyMedia] = useState<JellyfinItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const loadDashboardData = async () => {
      setIsLoading(true)
      try {
        const [resumeRes, moviesRes, showsRes, topRatedRes] = await Promise.allSettled([
          jellyfinApi.getResumeItems(user.Id, 12),
          jellyfinApi.getLatestItems(user.Id, 'Movie', 16),
          jellyfinApi.getLatestItems(user.Id, 'Series', 16),
          jellyfinApi.getItems(user.Id, {
            sortBy: 'CommunityRating',
            sortOrder: 'Descending',
            limit: 16,
            includeItemTypes: 'Movie,Series',
          }),
        ])

        const resumeItems = resumeRes.status === 'fulfilled' ? resumeRes.value.Items || [] : []
        const movies = moviesRes.status === 'fulfilled' ? moviesRes.value || [] : []
        const shows = showsRes.status === 'fulfilled' ? showsRes.value || [] : []
        const top = topRatedRes.status === 'fulfilled' ? topRatedRes.value.Items || [] : []

        setContinueWatching(resumeItems)
        setLatestMovies(movies)
        setLatestShows(shows)
        setTopRated(top)

        // Select featured hero item: prefer a movie or series with a rich backdrop
        const allCandidates = [...shows, ...movies, ...top]
        const heroCandidate =
          allCandidates.find(
            (c) =>
              (c.BackdropImageTags && c.BackdropImageTags.length > 0) ||
              c.ImageTags?.Backdrop
          ) || allCandidates[0]

        if (heroCandidate) {
          setFeaturedItem(heroCandidate)
        }

        // Fetch genre-specific rows in background
        jellyfinApi
          .getItems(user.Id, {
            genres: 'Action',
            limit: 12,
            includeItemTypes: 'Movie,Series',
          })
          .then((res) => setActionMovies(res.Items || []))
          .catch(() => {})

        jellyfinApi
          .getItems(user.Id, {
            genres: 'Comedy',
            limit: 12,
            includeItemTypes: 'Movie,Series',
          })
          .then((res) => setComedyMedia(res.Items || []))
          .catch(() => {})
      } catch (err) {
        console.error('Failed to load dashboard:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadDashboardData()
  }, [user])

  if (isLoading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-spinner" />
      </div>
    )
  }

  return (
    <div>
      <HeroBillboard
        item={featuredItem}
        onPlay={onPlay}
        onMoreInfo={onMoreInfo}
      />

      <div className="main-content">
        {continueWatching.length > 0 && (
          <ContentRow
            title="Continue Watching"
            items={continueWatching}
            onPlay={onPlay}
            onMoreInfo={onMoreInfo}
            onToggleFavorite={onToggleFavorite}
          />
        )}

        {latestMovies.length > 0 && (
          <ContentRow
            title="Recently Added Movies"
            items={latestMovies}
            onPlay={onPlay}
            onMoreInfo={onMoreInfo}
            onToggleFavorite={onToggleFavorite}
          />
        )}

        {latestShows.length > 0 && (
          <ContentRow
            title="Trending TV Series"
            items={latestShows}
            portrait={true}
            onPlay={onPlay}
            onMoreInfo={onMoreInfo}
            onToggleFavorite={onToggleFavorite}
          />
        )}

        {topRated.length > 0 && (
          <ContentRow
            title="Critically Acclaimed & Top Rated"
            items={topRated}
            onPlay={onPlay}
            onMoreInfo={onMoreInfo}
            onToggleFavorite={onToggleFavorite}
          />
        )}

        {actionMovies.length > 0 && (
          <ContentRow
            title="Action & Adventure"
            items={actionMovies}
            onPlay={onPlay}
            onMoreInfo={onMoreInfo}
            onToggleFavorite={onToggleFavorite}
          />
        )}

        {comedyMedia.length > 0 && (
          <ContentRow
            title="Comedies & Laughs"
            items={comedyMedia}
            onPlay={onPlay}
            onMoreInfo={onMoreInfo}
            onToggleFavorite={onToggleFavorite}
          />
        )}
      </div>
    </div>
  )
}
