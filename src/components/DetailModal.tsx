import React, { useState, useEffect } from 'react'
import {
  X,
  Play,
  Check,
  Film,
  MoreHorizontal,
  Download,
  CheckCircle2,
  Plus,
  ThumbsUp,
} from 'lucide-react'
import type { JellyfinItem } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'
import { useAuth } from '../context/AuthContext'
import { useOffline } from '../context/OfflineContext'
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
  const { downloadItem, isDownloaded, isDownloading, getDownloadProgress } = useOffline()
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
        const similarRes = await jellyfinApi.getSimilarItems(item.Id, user.Id, 10)
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

  // Format runtime ticks to "2h 15m" or "45m"
  const formatDuration = (ticks?: number) => {
    if (!ticks) return ''
    const totalMinutes = Math.round(ticks / (10000 * 1000 * 60))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  // Extract Audio Languages
  const audioLanguages = Array.from(
    new Set(
      item.MediaStreams?.filter((s) => s.Type === 'Audio' && (s.Language || s.DisplayTitle))
        .map((s) => s.DisplayTitle || s.Language || '')
        .filter(Boolean)
        .slice(0, 5) || []
    )
  )

  // Backdrop image
  const backdropUrl = jellyfinApi.getImageUrl(item.Id, 'Backdrop', {
    maxWidth: 1280,
    quality: 85,
    tag: item.BackdropImageTags?.[0] || item.ImageTags?.Backdrop,
  }) || jellyfinApi.getImageUrl(item.Id, 'Primary', { maxWidth: 800, quality: 85 })

  const isFavorite = !!item.UserData?.IsFavorite
  const runtimeFormatted = formatDuration(item.RunTimeTicks)

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          {/* Close Button Top-Right (Netflix style circle) */}
          <button className="modal-close-btn" onClick={onClose} title="Close" aria-label="Close">
            <X size={20} />
          </button>

          {/* Modal Hero / Backdrop Image */}
          <div
            className="modal-hero"
            style={{
              backgroundImage: `url("${backdropUrl}")`,
            }}
          >
            <div className="modal-hero-gradient" />
            <div className="modal-hero-title-container">
              <h2 className="modal-title">{item.Name}</h2>
            </div>
          </div>

          {/* Action Row - Netflix Native Mobile & Desktop Layout */}
          <div className="modal-header-actions">
            {/* Primary Big White Play Pill */}
            <button className="modal-primary-play-btn" onClick={() => onPlay(item)}>
              <Play size={22} fill="#000" />
              <span>{isSeries ? 'Play Next Episode' : 'Play'}</span>
            </button>

            {/* Circular Netflix Actions Row (Screenshot 4) */}
            <div className="modal-actions-row">
              {/* My List / Add */}
              {onToggleFavorite && (
                <button
                  className="modal-action-btn"
                  onClick={() => onToggleFavorite(item)}
                  title={isFavorite ? 'In My List' : 'Add to My List'}
                >
                  <div className={`modal-action-circle ${isFavorite ? 'active-list' : ''}`}>
                    {isFavorite ? <Check size={20} color="#E50914" strokeWidth={2.5} /> : <Plus size={20} />}
                  </div>
                  <span className="modal-action-label">{isFavorite ? 'In List' : 'My List'}</span>
                </button>
              )}

              {/* Watched / Rate Toggle */}
              <button
                className="modal-action-btn"
                onClick={handleToggleWatched}
                title={isPlayed ? 'Mark as Unwatched' : 'Mark as Watched'}
              >
                <div className={`modal-action-circle ${isPlayed ? 'active-watched' : ''}`}>
                  {isPlayed ? <Check size={20} color="#46d369" strokeWidth={2.5} /> : <ThumbsUp size={19} />}
                </div>
                <span className="modal-action-label" style={isPlayed ? { color: '#46d369' } : {}}>
                  {isPlayed ? 'Watched' : 'Rate'}
                </span>
              </button>

              {/* Download for Offline (Movies & standalone items) */}
              {!isSeries && (
                <button
                  className="modal-action-btn"
                  onClick={() => {
                    if (!isDownloaded(item.Id) && !isDownloading(item.Id)) {
                      downloadItem(item)
                    }
                  }}
                  title={isDownloaded(item.Id) ? 'Downloaded to device' : 'Download for offline play'}
                >
                  <div className={`modal-action-circle ${isDownloaded(item.Id) ? 'active-download' : ''}`}>
                    {isDownloaded(item.Id) ? (
                      <CheckCircle2 size={20} color="#46d369" />
                    ) : isDownloading(item.Id) ? (
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#E50914' }}>
                        {getDownloadProgress(item.Id)}%
                      </span>
                    ) : (
                      <Download size={19} />
                    )}
                  </div>
                  <span className="modal-action-label" style={isDownloaded(item.Id) ? { color: '#46d369' } : {}}>
                    {isDownloaded(item.Id)
                      ? 'Saved'
                      : isDownloading(item.Id)
                      ? `${getDownloadProgress(item.Id)}%`
                      : 'Download'}
                  </span>
                </button>
              )}

              {/* Trailer Preview Button */}
              {(trailers.length > 0 || (item.RemoteTrailers && item.RemoteTrailers.length > 0)) && (
                <button
                  className="modal-action-btn"
                  onClick={() => {
                    if (trailers.length > 0) {
                      setActiveTrailer(trailers[0])
                    } else if (item.RemoteTrailers && item.RemoteTrailers[0]) {
                      setActiveTrailer({ url: item.RemoteTrailers[0].Url })
                    }
                  }}
                  title="Watch Official Trailer"
                >
                  <div className="modal-action-circle">
                    <Film size={19} />
                  </div>
                  <span className="modal-action-label">Trailer</span>
                </button>
              )}

              {/* Manage Media Button */}
              <button
                className="modal-action-btn"
                onClick={() => setShowMediaManager(true)}
                title="Source File Info, Edit Metadata, Identify, Delete"
              >
                <div className="modal-action-circle">
                  <MoreHorizontal size={19} />
                </div>
                <span className="modal-action-label">Manage</span>
              </button>
            </div>
          </div>

          {/* Active Trailer Player Embed */}
          {activeTrailer && (
            <div className="modal-trailer-container">
              <div className="modal-trailer-header">
                <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>Official Trailer</span>
                <button
                  onClick={() => setActiveTrailer(null)}
                  style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>
              {'url' in activeTrailer ? (
                <iframe
                  src={activeTrailer.url.replace('watch?v=', 'embed/')}
                  title="Trailer"
                  style={{ width: '100%', aspectRatio: '16/9', border: 'none', borderRadius: 8 }}
                  allowFullScreen
                />
              ) : (
                <video
                  src={jellyfinApi.getDirectStreamUrl(activeTrailer.Id)}
                  controls
                  autoPlay
                  style={{ width: '100%', aspectRatio: '16/9', borderRadius: 8 }}
                />
              )}
            </div>
          )}

          {/* Modal Body */}
          <div className="modal-body">
            <div className="modal-meta-grid">
              <div className="modal-meta-left">
                {/* Netflix Meta Badges Row (Screenshot 4) */}
                <div className="modal-meta-badges">
                  <span className="match-score">
                    {item.CommunityRating ? `${Math.round(item.CommunityRating * 10)}% Match` : '98% Match'}
                  </span>
                  {item.ProductionYear && <span className="meta-year">{item.ProductionYear}</span>}
                  {item.OfficialRating && <span className="rating-tag">{item.OfficialRating}</span>}
                  {runtimeFormatted && <span className="meta-duration">{runtimeFormatted}</span>}
                  <span className="quality-pill">HD</span>
                  <span className="quality-pill">Spatial Audio</span>
                  {isSeries && (
                    <span className="meta-seasons">{seasons.length || 1} Season{seasons.length > 1 ? 's' : ''}</span>
                  )}
                </div>

                {/* Watch in Audio Languages Callout (Screenshot 4) */}
                {audioLanguages.length > 0 && (
                  <div className="modal-languages-callout">
                    Watch in <strong>{audioLanguages.join(', ')}</strong>
                  </div>
                )}

                <p className="modal-description">{item.Overview || 'No description available.'}</p>
              </div>

              {/* Specs Column */}
              <div className="modal-specs">
                {item.People && item.People.length > 0 && (
                  <div className="spec-item">
                    <strong className="spec-label">Cast: </strong>
                    <span className="spec-val">
                      {item.People.filter((p) => p.Type === 'Actor')
                        .slice(0, 5)
                        .map((p) => p.Name)
                        .join(', ')}
                    </span>
                  </div>
                )}

                {item.Genres && item.Genres.length > 0 && (
                  <div className="spec-item">
                    <strong className="spec-label">Genres: </strong>
                    <span className="spec-val">{item.Genres.join(', ')}</span>
                  </div>
                )}

                {item.Studios && item.Studios.length > 0 && (
                  <div className="spec-item">
                    <strong className="spec-label">Studios: </strong>
                    <span className="spec-val">{item.Studios.map((s) => s.Name).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Series Episodes Section */}
            {isSeries && seasons.length > 0 && (
              <div className="episodes-section">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Episodes</h3>
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
                  <div className="episodes-list">
                    {episodes.map((ep, idx) => {
                      const epThumb = jellyfinApi.getImageUrl(ep.Id, 'Primary', {
                        maxWidth: 320,
                        quality: 80,
                        tag: ep.ImageTags?.Primary,
                      })
                      const epDuration = formatDuration(ep.RunTimeTicks)

                      return (
                        <div
                          key={ep.Id}
                          className="episode-card"
                          onClick={() => onPlay(ep)}
                        >
                          <span className="episode-num">{ep.IndexNumber ?? idx + 1}</span>
                          <div className="episode-thumb-container">
                            <img
                              src={epThumb}
                              alt={ep.Name}
                              className="episode-thumb"
                              onError={(e) => {
                                ;(e.target as HTMLElement).style.display = 'none'
                              }}
                            />
                            {epDuration && <span className="episode-thumb-duration">{epDuration}</span>}
                          </div>
                          <div className="episode-details">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="episode-title">{ep.Name}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: '0.82rem', color: '#888' }}>{epDuration}</span>
                                <button
                                  className="ep-download-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!isDownloaded(ep.Id) && !isDownloading(ep.Id)) {
                                      downloadItem(ep)
                                    }
                                  }}
                                  title={isDownloaded(ep.Id) ? 'Downloaded' : 'Download Episode'}
                                >
                                  {isDownloaded(ep.Id) ? (
                                    <CheckCircle2 size={16} color="#46d369" />
                                  ) : isDownloading(ep.Id) ? (
                                    <span style={{ fontSize: '0.75rem', color: '#E50914', fontWeight: 700 }}>
                                      {getDownloadProgress(ep.Id)}%
                                    </span>
                                  ) : (
                                    <Download size={16} />
                                  )}
                                </button>
                              </div>
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

            {/* More Like This (Screenshot 4: 2-column on mobile, 3-column on desktop) */}
            {similarItems.length > 0 && (
              <div className="more-like-this-section">
                <h3 className="more-like-title">More Like This</h3>
                <div className="more-like-grid">
                  {similarItems.map((s) => {
                    const sThumb = jellyfinApi.getImageUrl(s.Id, 'Backdrop', {
                      maxWidth: 420,
                      quality: 80,
                    }) || jellyfinApi.getImageUrl(s.Id, 'Primary', {
                      maxWidth: 350,
                      quality: 80,
                    })
                    const sDuration = formatDuration(s.RunTimeTicks)

                    return (
                      <div
                        key={s.Id}
                        className="more-like-card"
                        onClick={() => onPlay(s)}
                      >
                        <div className="more-like-thumb-box">
                          <img
                            src={sThumb}
                            alt={s.Name}
                            className="more-like-thumb"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement
                              img.src = jellyfinApi.getImageUrl(s.Id, 'Primary', { maxWidth: 300, quality: 75 })
                            }}
                          />
                          {/* Duration Tag Top-Right on Thumbnail (Screenshot 4) */}
                          {sDuration && (
                            <span className="more-like-duration-tag">{sDuration}</span>
                          )}
                          <div className="more-like-play-overlay">
                            <Play size={26} fill="#fff" />
                          </div>
                        </div>

                        {/* Card Info Below Thumbnail */}
                        <div className="more-like-body">
                          <div className="more-like-row">
                            <span className="more-like-name">{s.Name}</span>
                            {onToggleFavorite && (
                              <button
                                className="more-like-fav-circle"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onToggleFavorite(s)
                                }}
                                title="Add to My List"
                              >
                                {s.UserData?.IsFavorite ? (
                                  <Check size={14} color="#E50914" />
                                ) : (
                                  <Plus size={14} />
                                )}
                              </button>
                            )}
                          </div>
                          <div className="more-like-meta-line">
                            {s.OfficialRating && (
                              <span className="rating-tag" style={{ fontSize: '0.68rem', padding: '0 4px' }}>
                                {s.OfficialRating}
                              </span>
                            )}
                            <span className="quality-pill" style={{ fontSize: '0.68rem', padding: '0 4px' }}>HD</span>
                            {s.ProductionYear && (
                              <span style={{ fontSize: '0.78rem', color: '#888' }}>{s.ProductionYear}</span>
                            )}
                          </div>
                          {s.Overview && (
                            <p className="more-like-snippet">{s.Overview}</p>
                          )}
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

      {/* Media Manager Modal */}
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
