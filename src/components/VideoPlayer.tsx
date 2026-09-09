import React, { useRef, useState, useEffect, useCallback } from 'react'
import Hls from 'hls.js'
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Subtitles,
  Layers,
  Activity,
  Check,
  SkipForward,
  PictureInPicture,
  Gauge,
  X,
} from 'lucide-react'
import type { JellyfinItem, JellyfinMediaStream } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'
import { useAuth } from '../context/AuthContext'

interface VideoPlayerProps {
  item: JellyfinItem
  onClose: () => void
  onNextEpisode?: (nextItem: JellyfinItem) => void
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ item: initialItem, onClose }) => {
  const { user } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const progressIntervalRef = useRef<number | null>(null)
  const hideControlsTimerRef = useRef<number | null>(null)

  const [item, setItem] = useState<JellyfinItem>(initialItem)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isHlsFallback, setIsHlsFallback] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)

  // Netflix Seek Ripple feedback (+10 / -10)
  const [seekFeedback, setSeekFeedback] = useState<{ type: 'forward' | 'rewind'; amount: number } | null>(null)

  // Telemetry: Stats for Nerds
  const [showStatsForNerds, setShowStatsForNerds] = useState(false)
  const [droppedFrames, setDroppedFrames] = useState(0)

  // Netflix 2-Column Audio & Subtitle menu
  const [showAudioSubModal, setShowAudioSubModal] = useState(false)
  const [audioStreams, setAudioStreams] = useState<JellyfinMediaStream[]>([])
  const [subtitleStreams, setSubtitleStreams] = useState<JellyfinMediaStream[]>([])
  const [selectedAudioIndex, setSelectedAudioIndex] = useState<number | undefined>(undefined)
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number | undefined>(undefined)

  // In-player Episodes drawer
  const [showEpisodesDrawer, setShowEpisodesDrawer] = useState(false)
  const [seasons, setSeasons] = useState<JellyfinItem[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')
  const [seasonEpisodes, setSeasonEpisodes] = useState<JellyfinItem[]>([])
  const [nextEpisode, setNextEpisode] = useState<JellyfinItem | null>(null)
  const [showBingeCountdown, setShowBingeCountdown] = useState(false)
  const [countdownSeconds, setCountdownSeconds] = useState(10)

  // Chapters & Skip Intro
  const [showSkipIntro, setShowSkipIntro] = useState(false)

  // Load detailed item streams & chapters
  useEffect(() => {
    if (!user) return
    jellyfinApi.getItem(user.Id, item.Id).then((full) => {
      setItem(full)
      const streams =
        full.MediaStreams ||
        (full.MediaSources && full.MediaSources[0]?.MediaStreams) ||
        []
      const audios = streams.filter((s) => s.Type === 'Audio')
      const subs = streams.filter((s) => s.Type === 'Subtitle')
      setAudioStreams(audios)
      setSubtitleStreams(subs)

      const defAudio = audios.find((a) => a.IsDefault) || audios[0]
      if (defAudio) setSelectedAudioIndex(defAudio.Index)
    }).catch(() => {})
  }, [item.Id, user])

  // Load seasons and episodes if item is a series/episode
  useEffect(() => {
    if (!user || !item.SeriesId) return
    jellyfinApi.getSeasons(item.SeriesId, user.Id).then((res) => {
      const sList = res.Items || []
      setSeasons(sList)
      const currentSeasonId = item.SeasonId || (sList[0] && sList[0].Id) || ''
      setSelectedSeasonId(currentSeasonId)
    }).catch(() => {})
  }, [item.SeriesId, item.SeasonId, user])

  useEffect(() => {
    if (!user || !item.SeriesId || !selectedSeasonId) return
    jellyfinApi.getEpisodes(item.SeriesId, selectedSeasonId, user.Id).then((res) => {
      setSeasonEpisodes(res.Items || [])
    }).catch(() => {})
  }, [selectedSeasonId, item.SeriesId, user])

  // Find next episode
  useEffect(() => {
    if (!user || !item.SeriesId || !item.SeasonId || item.IndexNumber === undefined) return
    jellyfinApi
      .getNextEpisode(item.SeriesId, item.SeasonId, item.IndexNumber, user.Id)
      .then((next) => setNextEpisode(next))
  }, [item, user])

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00'
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = Math.floor(secs % 60)
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  // Report progress to Jellyfin
  const reportProgress = useCallback(
    (paused: boolean, eventName = 'TimeUpdate') => {
      if (!videoRef.current) return
      const currentSeconds = videoRef.current.currentTime
      const positionTicks = Math.floor(currentSeconds * 1000 * 10000)

      jellyfinApi.reportPlaybackProgress({
        ItemId: item.Id,
        PositionTicks: positionTicks,
        IsPaused: paused,
        EventName: eventName,
        AudioStreamIndex: selectedAudioIndex,
        SubtitleStreamIndex: selectedSubtitleIndex,
      })
    },
    [item.Id, selectedAudioIndex, selectedSubtitleIndex]
  )

  // Start stream (Direct play with HLS fallback)
  const startStream = useCallback(
    (useHls: boolean) => {
      const video = videoRef.current
      if (!video) return

      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }

      const initialTicks = item.UserData?.PlaybackPositionTicks || 0
      const initialSeconds = initialTicks / (1000 * 10000)

      if (!useHls) {
        const directUrl = jellyfinApi.getDirectStreamUrl(item.Id)
        video.src = directUrl

        video.onloadedmetadata = () => {
          if (initialSeconds > 0 && initialSeconds < (video.duration || 0) - 10) {
            video.currentTime = initialSeconds
          }
          video.play().catch(() => {})
        }

        video.onerror = () => {
          console.warn('Direct Play failed. Falling back to Jellyfin HLS...')
          setIsHlsFallback(true)
          startStream(true)
        }
      } else {
        const hlsUrl = jellyfinApi.getHlsStreamUrl(item.Id, {
          audioStreamIndex: selectedAudioIndex,
          subtitleStreamIndex: selectedSubtitleIndex,
          startTimeTicks: initialTicks,
        })

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
          })
          hls.loadSource(hlsUrl)
          hls.attachMedia(video)
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {})
          })
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hls.startLoad()
                  break
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError()
                  break
                default:
                  hls.destroy()
                  break
              }
            }
          })
          hlsRef.current = hls
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = hlsUrl
          video.play().catch(() => {})
        }
      }

      jellyfinApi.reportPlaybackStart({
        ItemId: item.Id,
        PositionTicks: initialTicks,
        IsPaused: false,
        PlayMethod: useHls ? 'Transcode' : 'DirectPlay',
      })
    },
    [item, selectedAudioIndex, selectedSubtitleIndex]
  )

  useEffect(() => {
    startStream(isHlsFallback)

    progressIntervalRef.current = window.setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        reportProgress(false)
        // Telemetry update
        const video = videoRef.current as any
        if (video.getVideoPlaybackQuality) {
          const q = video.getVideoPlaybackQuality()
          setDroppedFrames(q.droppedVideoFrames || 0)
        }
      }
    }, 7000)

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
      if (videoRef.current) {
        const positionTicks = Math.floor(videoRef.current.currentTime * 1000 * 10000)
        jellyfinApi.reportPlaybackStopped({
          ItemId: item.Id,
          PositionTicks: positionTicks,
        })
      }
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
    }
  }, [startStream, isHlsFallback, item.Id, reportProgress])

  // Mouse activity
  const handleMouseMove = () => {
    setShowControls(true)
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current)
    hideControlsTimerRef.current = window.setTimeout(() => {
      if (isPlaying && !showAudioSubModal && !showEpisodesDrawer && !showStatsForNerds) {
        setShowControls(false)
        setShowSpeedMenu(false)
      }
    }, 3500)
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setIsPlaying(true)
      reportProgress(false, 'Play')
    } else {
      video.pause()
      setIsPlaying(false)
      reportProgress(true, 'Pause')
    }
  }

  const skipSeconds = (seconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds))
    reportProgress(video.paused, 'Seek')

    // Animated ripple badge
    setSeekFeedback({
      type: seconds > 0 ? 'forward' : 'rewind',
      amount: Math.abs(seconds),
    })
    setTimeout(() => setSeekFeedback(null), 800)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current
    if (!video || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, clickX / rect.width))
    const targetTime = percent * duration
    video.currentTime = targetTime
    setCurrentTime(targetTime)
    reportProgress(video.paused, 'Seek')
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  const togglePiP = async () => {
    if (!videoRef.current) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await videoRef.current.requestPictureInPicture()
      }
    } catch (err) {
      console.warn('PiP not supported or failed:', err)
    }
  }

  // Play next episode
  const handlePlayNextEpisode = () => {
    if (nextEpisode) {
      setShowBingeCountdown(false)
      setItem(nextEpisode)
      setIsHlsFallback(false)
    }
  }

  // Chapter intro skip check & end-of-episode countdown check
  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return
    const cTime = video.currentTime
    const dur = video.duration || duration
    setCurrentTime(cTime)

    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1))
    }

    // Check chapters for "Intro"
    if (item.Chapters && item.Chapters.length > 0) {
      const introChapter = item.Chapters.find((ch) =>
        ch.Name?.toLowerCase().includes('intro')
      )
      if (introChapter) {
        const startSec = introChapter.StartPositionTicks / (1000 * 10000)
        // Assume intro is 90s if next chapter not specified
        const endSec = startSec + 90
        setShowSkipIntro(cTime >= startSec && cTime <= endSec)
      }
    }

    // Check end-of-episode binge countdown (within 35 seconds of end)
    if (nextEpisode && dur > 60 && dur - cTime <= 35 && !showBingeCountdown) {
      setShowBingeCountdown(true)
      setCountdownSeconds(Math.max(1, Math.floor(dur - cTime)))
    }
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          skipSeconds(-10)
          break
        case 'ArrowRight':
          e.preventDefault()
          skipSeconds(10)
          break
        case 'ArrowUp':
          e.preventDefault()
          setVolume((v) => {
            const next = Math.min(1, v + 0.1)
            if (videoRef.current) videoRef.current.volume = next
            return next
          })
          break
        case 'ArrowDown':
          e.preventDefault()
          setVolume((v) => {
            const next = Math.max(0, v - 0.1)
            if (videoRef.current) videoRef.current.volume = next
            return next
          })
          break
        case 'f':
        case 'F':
          e.preventDefault()
          toggleFullscreen()
          break
        case 's':
        case 'S':
          e.preventDefault()
          setShowStatsForNerds((prev) => !prev)
          break
        case 'Escape':
          e.preventDefault()
          if (showAudioSubModal) {
            setShowAudioSubModal(false)
          } else if (showEpisodesDrawer) {
            setShowEpisodesDrawer(false)
          } else if (showStatsForNerds) {
            setShowStatsForNerds(false)
          } else if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {})
          } else {
            onClose()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay, onClose, showAudioSubModal, showEpisodesDrawer, showStatsForNerds])

  const mediaSource = item.MediaSources?.[0]
  const videoStream = audioStreams.length > 0 ? item.MediaStreams?.find((s) => s.Type === 'Video') : null

  return (
    <div
      className="video-player-container"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={handleMouseMove}
    >
      <video
        ref={videoRef}
        className="video-element"
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={() => {
          if (videoRef.current) setDuration(videoRef.current.duration)
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={togglePlay}
      />

      {/* Animated Center Seek Ripple (+10 / -10) */}
      {seekFeedback && (
        <div className="seek-ripple-overlay">
          <div className="seek-ripple-circle">
            {seekFeedback.type === 'forward' ? <RotateCw size={42} /> : <RotateCcw size={42} />}
            <span className="seek-ripple-text">
              {seekFeedback.type === 'forward' ? '+10' : '-10'}
            </span>
          </div>
        </div>
      )}

      {/* Skip Intro Button */}
      {showSkipIntro && (
        <button
          className="skip-intro-btn"
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.currentTime += 85
              setShowSkipIntro(false)
            }
          }}
        >
          Skip Intro
        </button>
      )}

      {/* Next Episode Binge Countdown Card */}
      {showBingeCountdown && nextEpisode && (
        <div className="binge-countdown-card">
          <div style={{ fontSize: '0.85rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>
            Next Episode in {countdownSeconds}s
          </div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', margin: '4px 0' }}>
            {nextEpisode.Name}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn-play" style={{ padding: '6px 14px', fontSize: '0.9rem' }} onClick={handlePlayNextEpisode}>
              <Play size={16} fill="#000" />
              <span>Play Now</span>
            </button>
            <button
              className="btn-info"
              style={{ padding: '6px 12px', fontSize: '0.9rem' }}
              onClick={() => setShowBingeCountdown(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* STATS FOR NERDS Live Floating Telemetry HUD */}
      {showStatsForNerds && (
        <div className="stats-for-nerds-hud">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ color: '#E50914', letterSpacing: 1 }}>STATS FOR NERDS</strong>
            <button onClick={() => setShowStatsForNerds(false)} style={{ color: '#888' }}>
              <X size={14} />
            </button>
          </div>
          <div className="nerd-stat">
            <span>Stream Mode:</span>
            <strong style={{ color: isHlsFallback ? '#ffaa00' : '#46d369' }}>
              {isHlsFallback ? 'HLS Transcode (Universal)' : 'Direct Play (Native 0% CPU)'}
            </strong>
          </div>
          <div className="nerd-stat">
            <span>Resolution:</span>
            <span>{videoStream?.Width ? `${videoStream.Width}x${videoStream.Height}` : `${videoRef.current?.videoWidth || 1920}x${videoRef.current?.videoHeight || 1080}`}</span>
          </div>
          <div className="nerd-stat">
            <span>Video Codec:</span>
            <span>{videoStream?.Codec?.toUpperCase() || 'H.264'}</span>
          </div>
          <div className="nerd-stat">
            <span>Audio Codec:</span>
            <span>{audioStreams[0]?.Codec?.toUpperCase() || 'AAC'} ({audioStreams[0]?.Channels ? `${audioStreams[0].Channels}ch` : '2ch Stereo'})</span>
          </div>
          <div className="nerd-stat">
            <span>Buffer Health:</span>
            <span>{(buffered - currentTime).toFixed(1)}s ahead</span>
          </div>
          <div className="nerd-stat">
            <span>Dropped Frames:</span>
            <span>{droppedFrames}</span>
          </div>
          <div className="nerd-stat">
            <span>Disk Path:</span>
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#888', wordBreak: 'break-all' }}>
              {mediaSource?.Path || item.Path || 'OMV Docker Mounted'}
            </span>
          </div>
        </div>
      )}

      {/* In-Player Series Episodes Drawer */}
      {showEpisodesDrawer && (
        <div className="episodes-drawer-overlay" onClick={() => setShowEpisodesDrawer(false)}>
          <div className="episodes-drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Layers size={22} color="#E50914" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Episodes</h3>
              </div>
              <button onClick={() => setShowEpisodesDrawer(false)} style={{ color: '#fff' }}>
                <X size={20} />
              </button>
            </div>

            {seasons.length > 1 && (
              <select
                className="season-select"
                style={{ marginBottom: 16, width: '100%' }}
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
              >
                {seasons.map((s) => (
                  <option key={s.Id} value={s.Id}>
                    {s.Name}
                  </option>
                ))}
              </select>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
              {seasonEpisodes.map((ep, idx) => {
                const isCurrent = ep.Id === item.Id
                const epThumb = jellyfinApi.getImageUrl(ep.Id, 'Primary', { maxWidth: 240, quality: 80 })
                return (
                  <div
                    key={ep.Id}
                    className={`episode-card ${isCurrent ? 'active-playing-ep' : ''}`}
                    onClick={() => {
                      setItem(ep)
                      setIsHlsFallback(false)
                      setShowEpisodesDrawer(false)
                    }}
                  >
                    <span className="episode-num">{ep.IndexNumber ?? idx + 1}</span>
                    <img src={epThumb} alt={ep.Name} className="episode-thumb" style={{ width: 100 }} />
                    <div className="episode-details">
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="episode-title" style={{ color: isCurrent ? '#E50914' : '#fff' }}>
                          {ep.Name}
                        </span>
                        {isCurrent && <span className="now-playing-tag">PLAYING</span>}
                      </div>
                      <p className="episode-overview" style={{ fontSize: '0.78rem' }}>{ep.Overview}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Netflix Exact 2-Column Audio & Subtitles Panel */}
      {showAudioSubModal && (
        <div className="audio-sub-modal-overlay" onClick={() => setShowAudioSubModal(false)}>
          <div className="audio-sub-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Audio & Subtitles</h3>
              <button onClick={() => setShowAudioSubModal(false)} style={{ color: '#fff' }}>
                <X size={20} />
              </button>
            </div>

            <div className="audio-sub-grid">
              {/* Left: Audio */}
              <div className="audio-sub-column">
                <h4 className="audio-sub-col-title">Audio</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {audioStreams.map((a) => {
                    const isSelected = selectedAudioIndex === a.Index
                    const channelStr = a.Channels === 6 ? '5.1' : a.Channels === 8 ? '7.1' : 'Stereo'
                    return (
                      <button
                        key={a.Index}
                        className={`audio-sub-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedAudioIndex(a.Index)
                          setIsHlsFallback(true)
                          startStream(true)
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {isSelected ? <Check size={16} color="#E50914" /> : <div style={{ width: 16 }} />}
                          <span>{a.DisplayTitle || a.Language || `Track ${a.Index}`}</span>
                        </div>
                        <span className="audio-badge">{channelStr}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Right: Subtitles */}
              <div className="audio-sub-column">
                <h4 className="audio-sub-col-title">Subtitles</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    className={`audio-sub-item ${selectedSubtitleIndex === undefined ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedSubtitleIndex(undefined)
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {selectedSubtitleIndex === undefined ? <Check size={16} color="#E50914" /> : <div style={{ width: 16 }} />}
                      <span>Off</span>
                    </div>
                  </button>

                  {subtitleStreams.map((s) => {
                    const isSelected = selectedSubtitleIndex === s.Index
                    return (
                      <button
                        key={s.Index}
                        className={`audio-sub-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedSubtitleIndex(s.Index)
                          setIsHlsFallback(true)
                          startStream(true)
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {isSelected ? <Check size={16} color="#E50914" /> : <div style={{ width: 16 }} />}
                          <span>{s.DisplayTitle || s.Language || `Subtitle ${s.Index}`}</span>
                        </div>
                        {s.Codec && <span className="audio-badge">{s.Codec.toUpperCase()}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Controls Overlay */}
      <div className={`player-controls-overlay ${showControls ? '' : 'hidden'}`}>
        {/* Top bar */}
        <div className="player-top-bar">
          <button className="player-back-btn" onClick={onClose}>
            <ArrowLeft size={28} />
          </button>
          <div className="player-title-info">
            <span className="player-main-title">{item.SeriesName || item.Name}</span>
            {item.SeriesName && (
              <span className="player-sub-title">
                {item.SeasonName ? `${item.SeasonName} • ` : ''}
                {item.IndexNumber ? `Ep ${item.IndexNumber}: ` : ''}
                {item.Name}
              </span>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="player-bottom-bar">
          {/* Scrub bar */}
          <div className="scrub-container" onClick={handleSeek}>
            <div className="scrub-track">
              {duration > 0 && (
                <div
                  className="scrub-buffered"
                  style={{ width: `${(buffered / duration) * 100}%` }}
                />
              )}
              {duration > 0 && (
                <div
                  className="scrub-progress"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
              )}
              {duration > 0 && (
                <div
                  className="scrub-thumb"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />
              )}
            </div>
          </div>

          {/* Action buttons row */}
          <div className="player-actions-row">
            <div className="player-actions-left">
              <button className="player-btn" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? <Pause size={28} fill="white" /> : <Play size={28} fill="white" />}
              </button>

              {/* 10s Rewind */}
              <button className="player-btn circular-seek-btn" onClick={() => skipSeconds(-10)} title="Rewind 10s">
                <RotateCcw size={24} />
                <span className="seek-number">10</span>
              </button>

              {/* 10s Forward */}
              <button className="player-btn circular-seek-btn" onClick={() => skipSeconds(10)} title="Forward 10s">
                <RotateCw size={24} />
                <span className="seek-number">10</span>
              </button>

              {/* Volume */}
              <div className="volume-container">
                <button
                  className="player-btn"
                  onClick={() => {
                    const next = !isMuted
                    setIsMuted(next)
                    if (videoRef.current) videoRef.current.muted = next
                  }}
                >
                  {isMuted || volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  className="volume-slider"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value)
                    setVolume(val)
                    setIsMuted(val === 0)
                    if (videoRef.current) {
                      videoRef.current.volume = val
                      videoRef.current.muted = val === 0
                    }
                  }}
                />
              </div>

              <span className="time-display">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="player-actions-right">
              {/* Next Episode Button */}
              {nextEpisode && (
                <button
                  className="player-btn"
                  onClick={handlePlayNextEpisode}
                  title={`Next: ${nextEpisode.Name}`}
                >
                  <SkipForward size={22} />
                </button>
              )}

              {/* Series Episodes Drawer Button */}
              {item.SeriesId && (
                <button
                  className="player-btn"
                  title="Episodes"
                  onClick={() => {
                    setShowEpisodesDrawer(!showEpisodesDrawer)
                    setShowAudioSubModal(false)
                  }}
                >
                  <Layers size={22} />
                </button>
              )}

              {/* Audio & Subtitles 2-Column Menu Button */}
              <button
                className="player-btn"
                title="Audio & Subtitles"
                onClick={() => {
                  setShowAudioSubModal(!showAudioSubModal)
                  setShowEpisodesDrawer(false)
                }}
              >
                <Subtitles size={22} />
              </button>

              {/* Playback Speed Menu */}
              <div style={{ position: 'relative' }}>
                <button
                  className="player-btn"
                  title="Playback Speed"
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                >
                  <Gauge size={22} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, marginLeft: 2 }}>{playbackSpeed}x</span>
                </button>
                {showSpeedMenu && (
                  <div className="dropdown-menu" style={{ bottom: '45px', top: 'auto', right: 0, minWidth: 120 }}>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                      <button
                        key={spd}
                        className="dropdown-item"
                        style={{ color: playbackSpeed === spd ? '#E50914' : 'inherit' }}
                        onClick={() => {
                          setPlaybackSpeed(spd)
                          if (videoRef.current) videoRef.current.playbackRate = spd
                          setShowSpeedMenu(false)
                        }}
                      >
                        {spd}x {spd === 1 ? '(Normal)' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Picture-in-Picture */}
              <button className="player-btn" title="Picture in Picture" onClick={togglePiP}>
                <PictureInPicture size={22} />
              </button>

              {/* Stats for Nerds */}
              <button
                className="player-btn"
                title="Stats for Nerds (S)"
                style={{ color: showStatsForNerds ? '#E50914' : 'inherit' }}
                onClick={() => setShowStatsForNerds(!showStatsForNerds)}
              >
                <Activity size={22} />
              </button>

              {/* Fullscreen */}
              <button className="player-btn" onClick={toggleFullscreen} title="Fullscreen (F)">
                {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
