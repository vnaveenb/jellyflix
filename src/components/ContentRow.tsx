import React, { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { JellyfinItem } from '../types/jellyfin'
import { MediaCard } from './MediaCard'

interface ContentRowProps {
  title: string
  items: JellyfinItem[]
  portrait?: boolean
  onPlay: (item: JellyfinItem) => void
  onMoreInfo: (item: JellyfinItem) => void
  onToggleFavorite?: (item: JellyfinItem) => void
}

export const ContentRow: React.FC<ContentRowProps> = ({
  title,
  items,
  portrait = false,
  onPlay,
  onMoreInfo,
  onToggleFavorite,
}) => {
  const trackRef = useRef<HTMLDivElement>(null)

  if (!items || items.length === 0) {
    return null
  }

  const handleScroll = (direction: 'left' | 'right') => {
    if (trackRef.current) {
      const scrollAmount = trackRef.current.clientWidth * 0.75
      trackRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      })
    }
  }

  return (
    <div className="content-row">
      <div className="row-header">
        <h3 className="row-title">{title}</h3>
      </div>

      <div className="row-container">
        <button
          className="carousel-paddle left"
          onClick={() => handleScroll('left')}
          title="Scroll Left"
          aria-label="Scroll Left"
        >
          <ChevronLeft size={30} />
        </button>

        <div className="carousel-track" ref={trackRef}>
          {items.map((item) => (
            <MediaCard
              key={item.Id}
              item={item}
              portrait={portrait}
              onPlay={onPlay}
              onMoreInfo={onMoreInfo}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>

        <button
          className="carousel-paddle right"
          onClick={() => handleScroll('right')}
          title="Scroll Right"
          aria-label="Scroll Right"
        >
          <ChevronRight size={30} />
        </button>
      </div>
    </div>
  )
}
