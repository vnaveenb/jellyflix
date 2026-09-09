import React from 'react'
import { Play, Heart, Film, Check } from 'lucide-react'
import type { JellyfinItem } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'

interface MediaCardProps {
  item: JellyfinItem
  portrait?: boolean
  onPlay: (item: JellyfinItem) => void
  onMoreInfo: (item: JellyfinItem) => void
  onToggleFavorite?: (item: JellyfinItem) => void
  onToggleWatched?: (item: JellyfinItem) => void
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  portrait = false,
  onPlay,
  onMoreInfo,
  onToggleFavorite,
  onToggleWatched,
}) => {
  // Primary image or Backdrop
  const imageUrl = portrait
    ? jellyfinApi.getImageUrl(item.Id, 'Primary', {
        maxWidth: 400,
        quality: 85,
        tag: item.ImageTags?.Primary,
      })
    : jellyfinApi.getImageUrl(
        item.Id,
        item.ImageTags?.Backdrop ? 'Backdrop' : 'Primary',
        {
          maxWidth: 500,
          quality: 85,
          tag: item.ImageTags?.Backdrop || item.ImageTags?.Primary,
        }
      )

  // Calculate resume percentage
  let progressPercent = 0
  if (item.UserData?.PlaybackPositionTicks && item.RunTimeTicks) {
    progressPercent = Math.min(
      100,
      Math.round((item.UserData.PlaybackPositionTicks / item.RunTimeTicks) * 100)
    )
  }

  const isFavorite = !!item.UserData?.IsFavorite
  const isPlayed = !!item.UserData?.Played

  return (
    <div
      className="media-card"
      onClick={() => onMoreInfo(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onMoreInfo(item)
      }}
    >
      <div className={`card-image-wrap ${portrait ? 'portrait' : ''}`}>
        <img
          src={imageUrl}
          alt={item.Name}
          className="card-image"
          loading="lazy"
          onError={(e) => {
            ;(e.target as HTMLElement).style.display = 'none'
          }}
        />

        {/* Fallback film icon */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1c1c1c',
            zIndex: -1,
          }}
        >
          <Film size={28} color="#444" />
        </div>

        {/* Rating Badge */}
        {item.OfficialRating && (
          <span className="card-overlay-badge">{item.OfficialRating}</span>
        )}

        {/* Watched Checkmark Overlay */}
        {isPlayed && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'rgba(0, 0, 0, 0.75)',
              border: '1px solid #46d369',
              borderRadius: '50%',
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Watched"
          >
            <Check size={14} color="#46d369" />
          </div>
        )}

        {/* Progress Bar for Resume / Continue Watching */}
        {progressPercent > 0 && (
          <div className="card-progress-bar">
            <div className="card-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        )}
      </div>

      <div className="card-info">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 className="card-title" title={item.Name}>
            {item.Name}
          </h4>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onPlay(item)
              }}
              title="Play"
              style={{ padding: 2, color: 'white' }}
            >
              <Play size={16} fill="white" />
            </button>

            {onToggleWatched && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleWatched(item)
                }}
                title={isPlayed ? 'Mark as Unwatched' : 'Mark as Watched'}
                style={{ padding: 2, color: isPlayed ? '#46d369' : '#aaa' }}
              >
                <Check size={16} color={isPlayed ? '#46d369' : '#888'} />
              </button>
            )}

            {onToggleFavorite && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFavorite(item)
                }}
                title={isFavorite ? 'Remove from My List' : 'Add to My List'}
                style={{ padding: 2, color: isFavorite ? '#E50914' : '#aaa' }}
              >
                <Heart size={16} fill={isFavorite ? '#E50914' : 'none'} />
              </button>
            )}
          </div>
        </div>

        <div className="card-subtext">
          <span className="match-score">
            {item.CommunityRating ? `${Math.round(item.CommunityRating * 10)}% Match` : '96% Match'}
          </span>
          {item.ProductionYear && <span>{item.ProductionYear}</span>}
          {item.Type && <span style={{ textTransform: 'capitalize' }}>{item.Type.toLowerCase()}</span>}
        </div>
      </div>
    </div>
  )
}
