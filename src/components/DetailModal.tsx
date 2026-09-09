import React, { useState, useEffect } from 'react'
import {
  X,
  Play,
  Heart,
  Check,
  Film,
  MoreHorizontal,
} from 'lucide-react'
import type { JellyfinItem } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'
import { useAuth } from '../context/AuthContext'
import { MediaManagerModal } from './MediaManagerModal'

interface DetailModalProps {
  item: JellyfinItem
  onClose: () => void
  onPlay: (item: JellyfinItem) => void
  onToggleFavorite?: (item: JellyfinItem) => void
  onItemUpdated?: (updatedItem: JellyfinItem) => void
  onItemDeleted?: (deletedItemId: string) => void
}

export const DetailModal: React.FC<DetailModalProps> = ({
  item: initialItem,
  onClose,
  onPlay,
  onToggleFavorite,
  onItemUpdated,
  onItemDeleted,
}) => {
  const { user } = useAuth()
  const [item, setItem] = useState<JellyfinItem>(initialItem)
  const [seasons, setSeasons] = useState<JellyfinItem[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')
  const [episodes, setEpisodes] = useState<JellyfinItem[]>([])
  const [similarItems, setSimilarItems] = useState<JellyfinItem[]>([])
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false)
  const [showMediaManager, setShowMediaManager] = useState(false)
  const [isPlayed, setIsPlayed] = useState(!!initialItem.UserData?.Played)
  const [trailers, setTrailers] = useState<JellyfinItem[]>([])
  const [activeTrailer, setActiveTrailer] = useState<JellyfinItem | { url: string } | null>(null)

  const isSeries = item.Type === 'Series'

  // Fetch detailed metadata, seasons, episodes, and trailers
  useEffect(() => {
    if (!user) return

    const loadSeriesData = async () => {
      try {
        const detailed = await jellyfinApi.getItem(user.Id, item.Id)
        setItem(detailed)
        setIsPlayed(!!detailed.UserData?.Played)

        if (isSeries) {
          const seasonsRes = await jellyfinApi.getSeasons(item.Id, user.Id)
          if (seasonsRes.Items && seasonsRes.Items.length > 0) {
            setSeasons(seasonsRes.Items)
            setSelectedSeasonId(seasonsRes.Items[0].Id)
          }
        }

        // Fetch local trailers
        const localT = await jellyfinApi.getLocalTrailers(user.Id, item.Id)
        setTrailers(localT)

        // Load similar recommendations
        const similarRes = await jellyfinApi.getSimilarItems(item.Id, user.Id, 8)
        setSimilarItems(similarRes.Items || [])
      } catch (err) {
        console.error('Failed to load item details:', err)
      }
    }

    loadSeriesData()
  }, [item.Id, isSeries, user])

  // Fetch episodes when selected season changes
  useEffect(() => {
    if (!user || !selectedSeasonId) return

    const loadEpisodes = async () => {
      setIsLoadingEpisodes(true)
      try {
        const epRes = await jellyfinApi.getEpisodes(item.Id, selectedSeasonId, user.Id)
        setEpisodes(epRes.Items || [])
      } catch (err) {
        console.error('Failed to load episodes:', err)
      } finally {
        setIsLoadingEpisodes(false)
      }
    }

    loadEpisodes()
  }, [selectedSeasonId, item.Id, user])

  // Toggle Watched / Unwatched
  const handleToggleWatched = async () => {
    if (!user) return
    const nextState = !isPlayed
    setIsPlayed(nextState)
    if (item.UserData) {
      item.UserData.Played = nextState
    }
    try {
      await jellyfinApi.markPlayed(user.Id, item.Id, nextState)
      onItemUpdated?.(item)
    } catch (err) {
      console.error('Failed to update watched status:', err)
    }
  }

  // Backdrop image
  const backdropUrl = jellyfinApi.getImageUrl(item.Id, 'Backdrop', {
    maxWidth: 1280,
    quality: 85,
    tag: item.BackdropImageTags?.[0] || item.ImageTags?.Backdrop,
  })

  const runtimeMinutes = item.RunTimeTicks ? Math.round(item.RunTimeTicks / (10000 * 1000 * 60)) : null
  const isFavorite = !!item.UserData?.IsFavorite

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>

          {/* Modal Banner */}
          <div
            className="modal-hero"
            style={{
              backgroundImage: `url("${backdropUrl}")`,
            }}
          >
            <div className="modal-hero-gradient" />
            <div className="modal-hero-content">
              <h2 className="modal-title">{item.Name}</h2>
              <div className="hero-actions" style={{ flexWrap: 'wrap' }}>
                <button
                  className="btn-play"
                  onClick={() => {
                    if (episodes.length > 0) {
                      onPlay(episodes[0])
                    } else {
                      onPlay(item)
                    }
                  }}
                >
                  <Play size={20} fill="#000" />
                  <span>Play</span>
                </button>

                {/* Mark Watched Toggle */}
                <button
                  className="btn-info"
                  onClick={handleToggleWatched}
                  title={isPlayed ? 'Mark as Unwatched' : 'Mark as Watched'}
                  style={{ color: isPlayed ? '#46d369' : '#fff' }}
                >
                  <Check size={20} color={isPlayed ? '#46d369' : '#fff'} />
                  <span>{isPlayed ? 'Watched' : 'Mark Watched'}</span>
                </button>

                {/* Add to List */}
                {onToggleFavorite && (
                  <button
                    className="btn-info"
                    onClick={() => onToggleFavorite(item)}
                    style={{ color: isFavorite ? '#E50914' : '#fff' }}
                  >
                    <Heart size={20} fill={isFavorite ? '#E50914' : 'none'} />
                    <span>{isFavorite ? 'In My List' : 'Add to List'}</span>
                  </button>
                )}

                {/* Trailer Preview Button */}
                {(trailers.length > 0 || (item.RemoteTrailers && item.RemoteTrailers.length > 0)) && (
                  <button
                    className="btn-info"
                    onClick={() => {
                      if (trailers.length > 0) {
                        setActiveTrailer(trailers[0])
                      } else if (item.RemoteTrailers && item.RemoteTrailers[0]) {
                        setActiveTrailer({ url: item.RemoteTrailers[0].Url })
                      }
                    }}
                    title="Watch Trailer"
                  >
                    <Film size={20} />
                    <span>Trailer</span>
                  </button>
                )}

                {/* Manage Media Button */}
                <button
                  className="btn-info"
                  onClick={() => setShowMediaManager(true)}
                  title="Source File Info, Edit Metadata, Identify, Delete"
                >
                  <MoreHorizontal size={20} />
                  <span>Manage Media</span>
                </button>
              </div>
            </div>
          </div>

          {/* Modal Body */}
          <div className="modal-body">
            <div className="modal-meta-grid">
              <div>
                <div className="hero-meta" style={{ marginBottom: 14 }}>
                  <span className="match-score">
                    {item.CommunityRating ? `${Math.round(item.CommunityRating * 10)}% Match` : '97% Match'}
                  </span>
                  {item.ProductionYear && <span>{item.ProductionYear}</span>}
                  {item.OfficialRating && <span className="rating-tag">{item.OfficialRating}</span>}
                  {runtimeMinutes && <span>{runtimeMinutes}m</span>}
                  {isSeries && <span>{seasons.length || 1} Season{seasons.length > 1 ? 's' : ''}</span>}
                  {isPlayed && (
                    <span style={{ color: '#46d369', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                      <Check size={14} /> Watched
                    </span>
                  )}
                </div>

                <p className="modal-description">{item.Overview || 'No description available.'}</p>
              </div>

              <div className="modal-specs">
                {item.People && item.People.length > 0 && (
                  <div className="spec-item">
                    <strong>Cast: </strong>
                    <span>
                      {item.People.filter((p) => p.Type === 'Actor')
                        .slice(0, 4)
                        .map((p) => p.Name)
                        .join(', ')}
                    </span>
                  </div>
                )}

                {item.Genres && item.Genres.length > 0 && (
                  <div className="spec-item">
                    <strong>Genres: </strong>
                    <span>{item.Genres.join(', ')}</span>
                  </div>
                )}

                {item.Studios && item.Studios.length > 0 && (
                  <div className="spec-item">
                    <strong>Studios: </strong>
                    <span>{item.Studios.map((s) => s.Name).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Series Episodes Drawer */}
            {isSeries && seasons.length > 0 && (
              <div className="episodes-section">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Episodes</h3>
                  <select
                    className="season-select"
                    value={selectedSeasonId}
                    onChange={(e) => setSelectedSeasonId(e.target.value)}
                  >
                    {seasons.map((s) => (
                      <option key={s.Id} value={s.Id}>
                        {s.Name}
                      </option>
                    ))}
                  </select>
                </div>

                {isLoadingEpisodes ? (
                  <div className="loading-spinner" />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {episodes.map((ep, idx) => {
                      const epThumb = jellyfinApi.getImageUrl(ep.Id, 'Primary', {
                        maxWidth: 300,
                        quality: 80,
                        tag: ep.ImageTags?.Primary,
                      })
                      const epRuntime = ep.RunTimeTicks
                        ? `${Math.round(ep.RunTimeTicks / (10000 * 1000 * 60))}m`
                        : ''

                      return (
                        <div
                          key={ep.Id}
                          className="episode-card"
                          onClick={() => onPlay(ep)}
                        >
                          <span className="episode-num">{ep.IndexNumber ?? idx + 1}</span>
                          <img
                            src={epThumb}
                            alt={ep.Name}
                            className="episode-thumb"
                            onError={(e) => {
                              ;(e.target as HTMLElement).style.display = 'none'
                            }}
                          />
                          <div className="episode-details">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="episode-title">{ep.Name}</span>
                              <span style={{ fontSize: '0.82rem', color: '#888' }}>{epRuntime}</span>
                            </div>
                            <p className="episode-overview">{ep.Overview || 'No description available.'}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* More Like This */}
            {similarItems.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 20 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 16 }}>More Like This</h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: 16,
                  }}
                >
                  {similarItems.map((s) => {
                    const sThumb = jellyfinApi.getImageUrl(s.Id, 'Primary', {
                      maxWidth: 350,
                      quality: 80,
                    })
                    return (
                      <div
                        key={s.Id}
                        style={{
                          background: '#222',
                          borderRadius: 6,
                          overflow: 'hidden',
                          cursor: 'pointer',
                        }}
                        onClick={() => onPlay(s)}
                      >
                        <div style={{ aspectRatio: '16/9', position: 'relative' }}>
                          <img
                            src={sThumb}
                            alt={s.Name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'rgba(0,0,0,0.3)',
                            }}
                          >
                            <Play size={24} fill="#fff" />
                          </div>
                        </div>
                        <div style={{ padding: 10 }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{s.Name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>
                            {s.ProductionYear}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trailer Popup Player */}
      {activeTrailer && (
        <div className="modal-backdrop" style={{ zIndex: 600 }} onClick={() => setActiveTrailer(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: 880, background: '#000', padding: 10 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close-btn" onClick={() => setActiveTrailer(null)}>
              <X size={18} />
            </button>
            {'Id' in activeTrailer ? (
              <video
                src={jellyfinApi.getDirectStreamUrl(activeTrailer.Id)}
                controls
                autoPlay
                style={{ width: '100%', maxHeight: '75vh', borderRadius: 8 }}
              />
            ) : (
              <iframe
                src={activeTrailer.url.replace('watch?v=', 'embed/')}
                title="Trailer"
                style={{ width: '100%', height: '500px', border: 'none', borderRadius: 8 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
        </div>
      )}

      {/* Media Operations & File Info Modal */}
      {showMediaManager && (
        <MediaManagerModal
          item={item}
          onClose={() => setShowMediaManager(false)}
          onItemUpdated={(updated) => {
            setItem(updated)
            onItemUpdated?.(updated)
          }}
          onItemDeleted={(deletedId) => {
            setShowMediaManager(false)
            onClose()
            onItemDeleted?.(deletedId)
          }}
        />
      )}
    </>
  )
}
