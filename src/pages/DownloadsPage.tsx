import React, { useState } from 'react'
import {
  Play,
  Trash2,
  Download,
  X,
  HardDrive,
  Wifi,
  WifiOff,
  Film,
  Tv,
  CheckCircle2,
} from 'lucide-react'
import { useOffline } from '../context/OfflineContext'
import type { DownloadedItem } from '../services/downloadManager'
import type { JellyfinItem } from '../types/jellyfin'

interface DownloadsPageProps {
  onPlay: (item: JellyfinItem, isOffline?: boolean) => void
  onMoreInfo?: (item: JellyfinItem) => void
}

export const DownloadsPage: React.FC<DownloadsPageProps> = ({ onPlay }) => {
  const {
    downloads,
    activeDownloads,
    storage,
    cancelDownload,
    deleteDownload,
    isOfflineMode,
    toggleOfflineMode,
    isNetworkOnline,
  } = useOffline()

  const [activeFilter, setActiveFilter] = useState<'all' | 'movies' | 'series'>('all')

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  const formatSpeed = (bytesPerSec: number) => {
    if (!bytesPerSec || bytesPerSec <= 0) return ''
    return `${formatBytes(bytesPerSec)}/s`
  }

  // Filter downloads
  const filteredDownloads = downloads.filter((d) => {
    if (activeFilter === 'movies') return d.type === 'Movie'
    if (activeFilter === 'series') return d.type === 'Episode'
    return true
  })

  // Group TV Episodes by Series Name
  const seriesGroups = filteredDownloads.reduce((acc, item) => {
    if (item.type === 'Episode') {
      const seriesKey = item.seriesName || 'Other Shows'
      if (!acc[seriesKey]) acc[seriesKey] = []
      acc[seriesKey].push(item)
    }
    return acc
  }, {} as Record<string, DownloadedItem[]>)

  const moviesList = filteredDownloads.filter((d) => d.type === 'Movie')

  // Storage percentage
  const storageUsedPercent = storage.quota > 0 ? Math.min(100, (storage.used / storage.quota) * 100) : 0
  const freeBytes = Math.max(0, storage.quota - storage.used)

  return (
    <div className="downloads-page-container" style={{ padding: '80px 24px 100px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Top Header & Offline Switcher */}
      <div className="downloads-header-card" style={{
        background: 'rgba(28, 28, 28, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 16,
        padding: '20px 24px',
        marginBottom: 24,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Download size={26} color="#E50914" />
            Downloads & Offline
          </h1>
          <p style={{ color: '#aaa', fontSize: '0.88rem', margin: '4px 0 0 0' }}>
            Watch your downloaded movies and series completely offline without Wi-Fi or data.
          </p>
        </div>

        {/* Offline Mode Switcher */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(0, 0, 0, 0.4)',
          padding: '8px 16px',
          borderRadius: 30,
          border: isOfflineMode ? '1px solid #E50914' : '1px solid rgba(255, 255, 255, 0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isOfflineMode ? <WifiOff size={18} color="#E50914" /> : <Wifi size={18} color="#46d369" />}
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {isOfflineMode ? 'Offline Mode Active' : isNetworkOnline ? 'Online (Jellyfin Server)' : 'Offline (No Connection)'}
            </span>
          </div>

          <button
            onClick={toggleOfflineMode}
            style={{
              background: isOfflineMode ? '#E50914' : 'rgba(255, 255, 255, 0.2)',
              color: '#fff',
              border: 'none',
              borderRadius: 20,
              padding: '6px 14px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {isOfflineMode ? 'Disable Offline Mode' : 'Switch to Offline Mode'}
          </button>
        </div>
      </div>

      {/* Storage Gauge */}
      <div style={{
        background: 'rgba(22, 22, 22, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: '16px 20px',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', color: '#ddd', fontWeight: 600 }}>
            <HardDrive size={18} color="#aaa" />
            <span>Device Storage</span>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#aaa' }}>
            <strong style={{ color: '#fff' }}>{formatBytes(storage.used)}</strong> downloaded •{' '}
            <strong style={{ color: '#46d369' }}>{formatBytes(freeBytes)}</strong> available
          </span>
        </div>
        <div style={{ height: 8, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 4, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${Math.max(1, storageUsedPercent)}%`,
              background: 'linear-gradient(90deg, #E50914, #ff4b4b)',
              borderRadius: 4,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Active Downloading Items */}
      {activeDownloads.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spinner-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: '#E50914', display: 'inline-block' }} />
            Downloading ({activeDownloads.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeDownloads.map((act) => (
              <div
                key={act.itemId}
                style={{
                  background: 'rgba(30, 30, 30, 0.95)',
                  border: '1px solid rgba(229, 9, 20, 0.3)',
                  borderRadius: 12,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{act.name}</span>
                    <span style={{ fontSize: '0.8rem', color: '#aaa' }}>
                      {act.loadedBytes > 0 && `${formatBytes(act.loadedBytes)} / `}
                      {act.totalBytes > 0 ? formatBytes(act.totalBytes) : 'Calculating...'}
                      {act.speed > 0 && ` • ${formatSpeed(act.speed)}`}
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255, 255, 255, 0.15)', borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${act.progress}%`,
                        background: '#E50914',
                        borderRadius: 3,
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                </div>

                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#E50914', minWidth: 42 }}>
                  {act.progress}%
                </span>

                <button
                  onClick={() => cancelDownload(act.itemId)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    color: '#ddd',
                    borderRadius: '50%',
                    width: 34,
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  title="Cancel Download"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button
          onClick={() => setActiveFilter('all')}
          style={{
            background: activeFilter === 'all' ? '#E50914' : 'rgba(255, 255, 255, 0.1)',
            color: '#fff',
            border: 'none',
            borderRadius: 20,
            padding: '6px 16px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          All ({downloads.length})
        </button>
        <button
          onClick={() => setActiveFilter('movies')}
          style={{
            background: activeFilter === 'movies' ? '#E50914' : 'rgba(255, 255, 255, 0.1)',
            color: '#fff',
            border: 'none',
            borderRadius: 20,
            padding: '6px 16px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Film size={14} />
          Movies ({moviesList.length})
        </button>
        <button
          onClick={() => setActiveFilter('series')}
          style={{
            background: activeFilter === 'series' ? '#E50914' : 'rgba(255, 255, 255, 0.1)',
            color: '#fff',
            border: 'none',
            borderRadius: 20,
            padding: '6px 16px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Tv size={14} />
          TV Shows ({Object.keys(seriesGroups).length})
        </button>
      </div>

      {/* Empty State */}
      {downloads.length === 0 && activeDownloads.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'rgba(22, 22, 22, 0.6)',
          borderRadius: 16,
          border: '1px dashed rgba(255, 255, 255, 0.15)',
        }}>
          <Download size={48} color="#555" style={{ marginBottom: 16 }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 8px 0' }}>No Downloads Available</h3>
          <p style={{ color: '#888', maxWidth: 460, margin: '0 auto 20px auto', fontSize: '0.9rem' }}>
            Find a movie or TV episode you want to watch offline, then tap the Download button. Downloaded files are stored right in your browser for offline playback.
          </p>
        </div>
      )}

      {/* Movies Section */}
      {moviesList.length > 0 && (activeFilter === 'all' || activeFilter === 'movies') && (
        <div style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Film size={20} color="#E50914" />
            Movies
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {moviesList.map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'rgba(25, 25, 25, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ display: 'flex', padding: 12, gap: 14 }}>
                  <img
                    src={item.posterUrl}
                    alt={item.name}
                    style={{ width: 75, height: 110, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: '#111' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: '#aaa', marginBottom: 6 }}>
                        {item.productionYear && <span>{item.productionYear}</span>}
                        <span style={{ color: '#46d369', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <CheckCircle2 size={12} /> Offline Ready
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#888', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 4 }}>
                        {formatBytes(item.fileSize)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        onClick={() => onPlay(item.item, true)}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          background: '#E50914',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          padding: '7px 12px',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <Play size={14} fill="#fff" />
                        <span>Play</span>
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`Delete "${item.name}" from offline storage?`)) {
                            deleteDownload(item.id)
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: 'none',
                          color: '#aaa',
                          borderRadius: 6,
                          padding: '7px 10px',
                          cursor: 'pointer',
                        }}
                        title="Delete Download"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TV Series Section */}
      {Object.keys(seriesGroups).length > 0 && (activeFilter === 'all' || activeFilter === 'series') && (
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tv size={20} color="#E50914" />
            TV Shows
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {Object.entries(seriesGroups).map(([seriesTitle, episodes]) => (
              <div
                key={seriesTitle}
                style={{
                  background: 'rgba(25, 25, 25, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 14,
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>{seriesTitle}</h3>
                    <span style={{ fontSize: '0.8rem', color: '#aaa' }}>
                      {episodes.length} {episodes.length === 1 ? 'Episode' : 'Episodes'} downloaded
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {episodes.map((ep) => (
                    <div
                      key={ep.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: 8,
                        padding: '10px 14px',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#E50914', minWidth: 26 }}>
                          {ep.indexNumber ? `E${ep.indexNumber}` : '•'}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <h5 style={{ margin: '0 0 2px 0', fontSize: '0.92rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ep.name}
                          </h5>
                          <span style={{ fontSize: '0.75rem', color: '#888' }}>
                            {ep.seasonName ? `${ep.seasonName} • ` : ''}
                            {formatBytes(ep.fileSize)}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <button
                          onClick={() => onPlay(ep.item, true)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            background: '#E50914',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            padding: '6px 14px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Play size={13} fill="#fff" />
                          <span>Play</span>
                        </button>

                        <button
                          onClick={() => {
                            if (confirm(`Delete "${ep.name}" from offline storage?`)) {
                              deleteDownload(ep.id)
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#888',
                            cursor: 'pointer',
                            padding: 6,
                          }}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
