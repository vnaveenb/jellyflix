import React from 'react'
import { Play, Info } from 'lucide-react'
import type { JellyfinItem } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'

interface HeroBillboardProps {
  item: JellyfinItem | null
  onPlay: (item: JellyfinItem) => void
  onMoreInfo: (item: JellyfinItem) => void
}

export const HeroBillboard: React.FC<HeroBillboardProps> = ({ item, onPlay, onMoreInfo }) => {
  if (!item) {
    return (
      <div className="hero-billboard-container">
        <div className="hero-billboard" style={{ backgroundColor: '#141414' }}>
          <div className="hero-gradient-overlay" />
          <div className="hero-vignette-bottom" />
        </div>
      </div>
    )
  }

  const backdropUrl = jellyfinApi.getImageUrl(item.Id, 'Backdrop', {
    maxWidth: 1920,
    quality: 90,
    tag: item.BackdropImageTags?.[0] || item.ImageTags?.Backdrop,
  })

  // Format runtime ticks to minutes or hours/minutes
  const formatRuntime = (ticks?: number) => {
    if (!ticks) return null
    const totalMinutes = Math.round(ticks / (10000 * 1000 * 60))
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const runtimeStr = formatRuntime(item.RunTimeTicks)

  // Meta items for Netflix mobile bullet row: Film • Drama • 2026 • 2h 24m • U/A 7+
  const metaBullets = [
    item.Type === 'Series' ? 'Series' : 'Film',
    item.Genres?.[0],
    item.ProductionYear,
    runtimeStr,
    item.OfficialRating || 'U/A 13+',
  ].filter(Boolean)

  return (
    <div className="hero-billboard-container">
      <div
        className="hero-billboard"
        style={{
          backgroundImage: `url("${backdropUrl}")`,
        }}
      >
        <div className="hero-gradient-overlay" />
        <div className="hero-vignette-bottom" />

        <div className="hero-content">
          <div className="hero-badge">
            {item.Type === 'Series' ? 'TV SERIES' : 'NETFLIX ORIGINAL'}
          </div>

          <h1 className="hero-title">{item.Name}</h1>

          {/* Desktop Meta row */}
          <div className="hero-meta desktop-hero-meta">
            <span className="match-score">
              {item.CommunityRating ? `${Math.round(item.CommunityRating * 10)}% Match` : '98% Match'}
            </span>
            {item.ProductionYear && <span>{item.ProductionYear}</span>}
            {item.OfficialRating && <span className="rating-tag">{item.OfficialRating}</span>}
            {runtimeStr && <span>{runtimeStr}</span>}
            {item.Genres && item.Genres.length > 0 && (
              <span style={{ color: '#aaa' }}>{item.Genres.slice(0, 3).join(' • ')}</span>
            )}
          </div>

          {/* Mobile Meta bullet line like Netflix mobile screenshot 3 */}
          <div className="hero-meta-mobile-bullets">
            {metaBullets.join(' • ')}
          </div>

          {item.Overview && <p className="hero-overview">{item.Overview}</p>}

          <div className="hero-actions">
            <button className="btn-play" onClick={() => onPlay(item)}>
              <Play size={22} fill="#000" />
              <span>Play</span>
            </button>
            <button className="btn-info" onClick={() => onMoreInfo(item)}>
              <Info size={22} />
              <span>More Info</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
