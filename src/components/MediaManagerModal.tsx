import React, { useState, useEffect } from 'react'
import {
  X,
  FileText,
  Edit3,
  Search,
  Trash2,
  CheckCircle,
  AlertTriangle,
  HardDrive,
  Film,
  Volume2,
  Subtitles,
} from 'lucide-react'
import type { JellyfinItem, RemoteSearchResult } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'
import { useAuth } from '../context/AuthContext'

interface MediaManagerModalProps {
  item: JellyfinItem
  onClose: () => void
  onItemUpdated?: (updatedItem: JellyfinItem) => void
  onItemDeleted?: (deletedItemId: string) => void
}

export const MediaManagerModal: React.FC<MediaManagerModalProps> = ({
  item,
  onClose,
  onItemUpdated,
  onItemDeleted,
}) => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'info' | 'edit' | 'identify' | 'delete'>('info')
  const [detailedItem, setDetailedItem] = useState<JellyfinItem>(item)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)

  // Edit Metadata form state
  const [name, setName] = useState(item.Name || '')
  const [originalTitle, setOriginalTitle] = useState(item.OriginalTitle || '')
  const [year, setYear] = useState<number | string>(item.ProductionYear || '')
  const [overview, setOverview] = useState(item.Overview || '')
  const [communityRating, setCommunityRating] = useState<number | string>(item.CommunityRating || '')
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Identify form state
  const [searchTitle, setSearchTitle] = useState(item.Name || '')
  const [searchYear, setSearchYear] = useState<number | string>(item.ProductionYear || '')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<RemoteSearchResult[]>([])
  const [isApplying, setIsApplying] = useState(false)
  const [identifySuccess, setIdentifySuccess] = useState(false)

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Fetch full details (with path and media sources) if missing
  useEffect(() => {
    if (!user) return
    const loadDetails = async () => {
      setIsLoadingDetails(true)
      try {
        const fullItem = await jellyfinApi.getItem(user.Id, item.Id)
        setDetailedItem(fullItem)
        setName(fullItem.Name || '')
        setOriginalTitle(fullItem.OriginalTitle || '')
        setYear(fullItem.ProductionYear || '')
        setOverview(fullItem.Overview || '')
        setCommunityRating(fullItem.CommunityRating || '')
      } catch (err) {
        console.error('Failed to load item detail for MediaManager:', err)
      } finally {
        setIsLoadingDetails(false)
      }
    }
    loadDetails()
  }, [item.Id, user])

  // Save metadata changes
  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      const updateData: Partial<JellyfinItem> = {
        Name: name,
        OriginalTitle: originalTitle,
        Overview: overview,
      }
      if (year) updateData.ProductionYear = Number(year)
      if (communityRating) updateData.CommunityRating = Number(communityRating)

      await jellyfinApi.updateItem(item.Id, updateData)
      setSaveSuccess(true)
      const updated = { ...detailedItem, ...updateData }
      setDetailedItem(updated)
      onItemUpdated?.(updated)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      alert(`Failed to save metadata: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  // Identify / search remote metadata
  const handleSearchIdentify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchTitle.trim()) return
    setIsSearching(true)
    setSearchResults([])
    try {
      const results = await jellyfinApi.searchRemoteMetadata(
        item.Id,
        searchTitle.trim(),
        searchYear ? Number(searchYear) : undefined,
        item.Type === 'Series' ? 'Series' : 'Movie'
      )
      setSearchResults(results || [])
    } catch (err: any) {
      alert(`Identify search failed: ${err.message}`)
    } finally {
      setIsSearching(false)
    }
  }

  const handleApplyIdentify = async (result: RemoteSearchResult) => {
    setIsApplying(true)
    try {
      await jellyfinApi.applyRemoteMetadata(item.Id, result)
      setIdentifySuccess(true)
      if (user) {
        const refreshed = await jellyfinApi.getItem(user.Id, item.Id)
        setDetailedItem(refreshed)
        onItemUpdated?.(refreshed)
      }
      setTimeout(() => setIdentifySuccess(false), 3000)
    } catch (err: any) {
      alert(`Failed to apply metadata: ${err.message}`)
    } finally {
      setIsApplying(false)
    }
  }

  // Delete media
  const handleDeleteMedia = async () => {
    if (!confirmDelete) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await jellyfinApi.deleteItem(item.Id)
      onItemDeleted?.(item.Id)
      onClose()
    } catch (err: any) {
      setDeleteError(err.message || 'Deletion denied by Jellyfin user policy')
      setIsDeleting(false)
    }
  }

  const mediaSource = detailedItem.MediaSources?.[0]
  const filePath = mediaSource?.Path || detailedItem.Path
  const fileSizeMb = mediaSource?.Size ? (mediaSource.Size / (1024 * 1024)).toFixed(1) : null
  const fileSizeGb = mediaSource?.Size ? (mediaSource.Size / (1024 * 1024 * 1024)).toFixed(2) : null
  const container = mediaSource?.Container || detailedItem.Container
  const streams = mediaSource?.MediaStreams || detailedItem.MediaStreams || []
  const videoStream = streams.find((s) => s.Type === 'Video')
  const audioStreams = streams.filter((s) => s.Type === 'Audio')
  const subtitleStreams = streams.filter((s) => s.Type === 'Subtitle')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 840 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-btn" onClick={onClose} title="Close">
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div style={{ padding: '24px 30px 14px 30px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <HardDrive size={22} color="#E50914" />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>
              Media Operations & File Info
            </h2>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#888', marginTop: 4, display: 'block' }}>
            {detailedItem.Name} ({detailedItem.ProductionYear || 'Unknown Year'})
          </span>

          {/* Tab Navigation */}
          <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
            <button
              className={`nav-link ${activeTab === 'info' ? 'active' : ''}`}
              style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setActiveTab('info')}
            >
              <FileText size={15} />
              <span>Source File Info</span>
            </button>
            <button
              className={`nav-link ${activeTab === 'edit' ? 'active' : ''}`}
              style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setActiveTab('edit')}
            >
              <Edit3 size={15} />
              <span>Edit Metadata</span>
            </button>
            <button
              className={`nav-link ${activeTab === 'identify' ? 'active' : ''}`}
              style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setActiveTab('identify')}
            >
              <Search size={15} />
              <span>Identify</span>
            </button>
            <button
              className={`nav-link ${activeTab === 'delete' ? 'active' : ''}`}
              style={{
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: activeTab === 'delete' ? '#ff5252' : undefined,
              }}
              onClick={() => setActiveTab('delete')}
            >
              <Trash2 size={15} color="#ff5252" />
              <span>Delete</span>
            </button>
          </div>
        </div>

        {/* Modal Body Tabs */}
        <div style={{ padding: '24px 30px', maxHeight: '65vh', overflowY: 'auto' }}>
          {isLoadingDetails ? (
            <div className="loading-spinner" />
          ) : activeTab === 'info' ? (
            /* TAB 1: SOURCE FILE INFO */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* File on disk */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  padding: 16,
                  borderRadius: 8,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Server File Path (OMV Disk)
                </div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.92rem',
                    color: '#46d369',
                    wordBreak: 'break-all',
                    background: '#111',
                    padding: '8px 12px',
                    borderRadius: 4,
                  }}
                >
                  {filePath || 'Path not exposed by Jellyfin server'}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 12,
                    marginTop: 14,
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#888' }}>File Size:</span>
                    <div style={{ fontWeight: 600 }}>{fileSizeGb ? `${fileSizeGb} GB` : fileSizeMb ? `${fileSizeMb} MB` : 'Unknown'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#888' }}>Container:</span>
                    <div style={{ fontWeight: 600, textTransform: 'uppercase' }}>{container || 'N/A'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#888' }}>Bitrate:</span>
                    <div style={{ fontWeight: 600 }}>
                      {mediaSource?.Bitrate ? `${(mediaSource.Bitrate / 1000000).toFixed(2)} Mbps` : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Video Stream Info */}
              {videoStream && (
                <div
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    padding: 16,
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 700 }}>
                    <Film size={18} color="#E50914" />
                    <span>Video Stream</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#888' }}>Codec:</span>
                      <div style={{ fontWeight: 600 }}>{videoStream.Codec?.toUpperCase() || 'N/A'}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#888' }}>Resolution:</span>
                      <div style={{ fontWeight: 600 }}>{videoStream.Width}x{videoStream.Height}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#888' }}>Aspect Ratio:</span>
                      <div style={{ fontWeight: 600 }}>{videoStream.AspectRatio || 'N/A'}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#888' }}>Bit Depth:</span>
                      <div style={{ fontWeight: 600 }}>{videoStream.BitDepth ? `${videoStream.BitDepth}-bit` : '8-bit'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Audio Streams */}
              {audioStreams.length > 0 && (
                <div
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    padding: 16,
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 700 }}>
                    <Volume2 size={18} color="#E50914" />
                    <span>Audio Streams ({audioStreams.length})</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {audioStreams.map((a, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          background: '#181818',
                          borderRadius: 4,
                          fontSize: '0.85rem',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {a.DisplayTitle || a.Language || `Track ${a.Index}`}
                        </span>
                        <span style={{ color: '#888' }}>
                          {a.Codec?.toUpperCase()} • {a.Channels ? `${a.Channels} Channels` : ''} {a.IsDefault ? '• Default' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Subtitles */}
              {subtitleStreams.length > 0 && (
                <div
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    padding: 16,
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 700 }}>
                    <Subtitles size={18} color="#E50914" />
                    <span>Subtitle Streams ({subtitleStreams.length})</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {subtitleStreams.map((s, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          background: '#181818',
                          borderRadius: 4,
                          fontSize: '0.85rem',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {s.DisplayTitle || s.Language || `Subtitle ${s.Index}`}
                        </span>
                        <span style={{ color: '#888' }}>
                          {s.Codec?.toUpperCase()} {s.IsDefault ? '• Default' : ''} {s.IsForced ? '• Forced' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'edit' ? (
            /* TAB 2: EDIT METADATA */
            <form onSubmit={handleSaveMetadata} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {saveSuccess && (
                <div
                  style={{
                    background: 'rgba(70,211,105,0.2)',
                    border: '1px solid #46d369',
                    padding: 10,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '0.9rem',
                    color: '#46d369',
                  }}
                >
                  <CheckCircle size={18} />
                  <span>Metadata saved successfully to Jellyfin!</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Title / Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Original Title</label>
                  <input
                    type="text"
                    className="form-input"
                    value={originalTitle}
                    onChange={(e) => setOriginalTitle(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Release Year</label>
                  <input
                    type="number"
                    className="form-input"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Community Rating (0 to 10)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  className="form-input"
                  value={communityRating}
                  onChange={(e) => setCommunityRating(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Overview / Synopsis</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={overview}
                  onChange={(e) => setOverview(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn-primary-red"
                disabled={isSaving}
                style={{ alignSelf: 'flex-start', padding: '10px 24px' }}
              >
                {isSaving ? 'Saving...' : 'Save Metadata'}
              </button>
            </form>
          ) : activeTab === 'identify' ? (
            /* TAB 3: IDENTIFY (TMDB / TVDB) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {identifySuccess && (
                <div
                  style={{
                    background: 'rgba(70,211,105,0.2)',
                    border: '1px solid #46d369',
                    padding: 10,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '0.9rem',
                    color: '#46d369',
                  }}
                >
                  <CheckCircle size={18} />
                  <span>Metadata and artwork updated from remote provider!</span>
                </div>
              )}

              <form
                onSubmit={handleSearchIdentify}
                style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}
              >
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Title</label>
                  <input
                    type="text"
                    className="form-input"
                    value={searchTitle}
                    onChange={(e) => setSearchTitle(e.target.value)}
                    placeholder="Search movie or TV title..."
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Year (optional)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={searchYear}
                    onChange={(e) => setSearchYear(e.target.value)}
                    placeholder="Year"
                  />
                </div>
                <button
                  type="submit"
                  className="btn-primary-red"
                  disabled={isSearching}
                  style={{ height: 46, padding: '0 20px' }}
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </form>

              {/* Search Results */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {searchResults.map((res, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      background: '#1f1f1f',
                      padding: 12,
                      borderRadius: 6,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {res.ImageUrl ? (
                      <img
                        src={res.ImageUrl}
                        alt={res.Name}
                        style={{ width: 50, height: 75, objectFit: 'cover', borderRadius: 4 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 50,
                          height: 75,
                          background: '#111',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 4,
                        }}
                      >
                        <Film size={20} color="#555" />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                        {res.Name} {res.ProductionYear ? `(${res.ProductionYear})` : ''}
                      </div>
                      <span style={{ fontSize: '0.8rem', color: '#888' }}>
                        Provider: {res.SearchProviderName || 'TheMovieDb'}
                      </span>
                      {res.Overview && (
                        <p
                          style={{
                            fontSize: '0.82rem',
                            color: '#aaa',
                            marginTop: 4,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            lineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {res.Overview}
                        </p>
                      )}
                    </div>
                    <button
                      className="btn-play"
                      style={{ fontSize: '0.9rem', padding: '8px 16px' }}
                      onClick={() => handleApplyIdentify(res)}
                      disabled={isApplying}
                    >
                      {isApplying ? 'Applying...' : 'Apply'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* TAB 4: DELETE MEDIA */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div
                style={{
                  background: 'rgba(229,9,20,0.15)',
                  border: '1px solid var(--netflix-red)',
                  padding: 18,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                }}
              >
                <AlertTriangle size={24} color="#E50914" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                    Delete "{detailedItem.Name}" from Jellyfin & Disk
                  </h4>
                  <p style={{ fontSize: '0.88rem', color: '#ccc', lineHeight: 1.5 }}>
                    This action will permanently delete this media item and its corresponding file on your server disk:
                  </p>
                  <code style={{ fontSize: '0.82rem', color: '#ff8a8a', display: 'block', marginTop: 6 }}>
                    {filePath || 'Media File'}
                  </code>
                </div>
              </div>

              {deleteError && (
                <div
                  style={{
                    background: 'rgba(229,9,20,0.25)',
                    border: '1px solid #ff5252',
                    padding: 12,
                    borderRadius: 6,
                    fontSize: '0.88rem',
                    color: '#ff8a8a',
                  }}
                >
                  <strong>Cannot Delete:</strong> {deleteError}
                  <div style={{ marginTop: 4, fontSize: '0.8rem', color: '#ddd' }}>
                    Note: Jellyfin requires "Allow Media Deletion" to be enabled for your user in Jellyfin Dashboard → Users → Policy.
                  </div>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.92rem' }}>
                <input
                  type="checkbox"
                  checked={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#E50914' }}
                />
                <span>I understand this will permanently delete this file and cannot be undone.</span>
              </label>

              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <button
                  className="btn-primary-red"
                  style={{ background: '#b81d24' }}
                  disabled={!confirmDelete || isDeleting}
                  onClick={handleDeleteMedia}
                >
                  {isDeleting ? 'Deleting File...' : 'Permanently Delete'}
                </button>
                <button className="btn-manage-profiles" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
