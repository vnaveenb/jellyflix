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
  AudioLines,
} from 'lucide-react'
import type { JellyfinItem, JellyfinMediaStream } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'

interface VideoPlayerProps {
  item: JellyfinItem
  onClose: () => void
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ item, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const progressIntervalRef = useRef<number | null>(null)
  const hideControlsTimerRef = useRef<number | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isHlsFallback, setIsHlsFallback] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>('')

  // Media tracks
  const [audioStreams, setAudioStreams] = useState<JellyfinMediaStream[]>([])
  const [subtitleStreams, setSubtitleStreams] = useState<JellyfinMediaStream[]>([])
  const [selectedAudioIndex, setSelectedAudioIndex] = useState<number | undefined>(undefined)
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number | undefined>(undefined)
  const [showAudioMenu, setShowAudioMenu] = useState(false)
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false)

  // Parse streams from item or media sources
  useEffect(() => {
    const streams =
      item.MediaStreams ||
      (item.MediaSources && item.MediaSources[0]?.MediaStreams) ||
      []

    const audios = streams.filter((s) => s.Type === 'Audio')
    const subtitles = streams.filter((s) => s.Type === 'Subtitle')

    setAudioStreams(audios)
    setSubtitleStreams(subtitles)

    const defaultAudio = audios.find((a) => a.IsDefault) || audios[0]
    if (defaultAudio) setSelectedAudioIndex(defaultAudio.Index)
  }, [item])

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

  // Start stream: Try direct play first, fall back to HLS
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
        // Direct stream
        const directUrl = jellyfinApi.getDirectStreamUrl(item.Id)
        video.src = directUrl

        video.onloadedmetadata = () => {
          if (initialSeconds > 0 && initialSeconds < (video.duration || 0) - 10) {
            video.currentTime = initialSeconds
          }
          video.play().catch(() => {})
        }

        video.onerror = () => {
          console.warn('Direct Play failed. Falling back to Jellyfin HLS transcoding stream...')
          setStatusMessage('Direct play unavailable, switching to HLS transcoder...')
          setIsHlsFallback(true)
          startStream(true)
        }
      } else {
        // HLS stream
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
            setStatusMessage('')
            video.play().catch(() => {})
          })
          hls.on(Hls.Events.ERROR, (_event, data) => {
            console.error('HLS error:', data)
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

      // Jellyfin Playback Start reporting
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

    // Progress interval every 7 seconds
    progressIntervalRef.current = window.setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        reportProgress(false)
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

  // Mouse activity controls auto-hide
  const handleMouseMove = () => {
    setShowControls(true)
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current)
    hideControlsTimerRef.current = window.setTimeout(() => {
      if (isPlaying) {
        setShowControls(false)
        setShowAudioMenu(false)
        setShowSubtitleMenu(false)
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

  const skipSeconds = (seconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds))
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

  // Keyboard navigation inside player
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
          setVolume((v) => Math.min(1, v + 0.1))
          if (videoRef.current) videoRef.current.volume = Math.min(1, volume + 0.1)
          break
        case 'ArrowDown':
          e.preventDefault()
          setVolume((v) => Math.max(0, v - 0.1))
          if (videoRef.current) videoRef.current.volume = Math.max(0, volume - 0.1)
          break
        case 'f':
        case 'F':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'Escape':
          e.preventDefault()
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {})
          } else {
            onClose()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay, volume, onClose])

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
        onTimeUpdate={() => {
          if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime)
            if (videoRef.current.buffered.length > 0) {
              setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1))
            }
          }
        }}
        onDurationChange={() => {
          if (videoRef.current) setDuration(videoRef.current.duration)
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={togglePlay}
      />

      {statusMessage && (
        <div className="player-center-notice">
          <div
            style={{
              background: 'rgba(0,0,0,0.8)',
              padding: '10px 20px',
              borderRadius: 8,
              border: '1px solid #E50914',
              color: '#fff',
              fontSize: '0.95rem',
            }}
          >
            {statusMessage}
          </div>
        </div>
      )}

      {/* Controls Overlay */}
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
                {item.SeasonName ? `${item.SeasonName} - ` : ''}
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
              <button className="player-btn" onClick={togglePlay}>
                {isPlaying ? <Pause size={26} fill="white" /> : <Play size={26} fill="white" />}
              </button>

              <button className="player-btn" onClick={() => skipSeconds(-10)} title="Rewind 10s">
                <RotateCcw size={22} />
              </button>

              <button className="player-btn" onClick={() => skipSeconds(10)} title="Forward 10s">
                <RotateCw size={22} />
              </button>

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
              {/* Audio stream selector */}
              {audioStreams.length > 1 && (
                <div style={{ position: 'relative' }}>
                  <button
                    className="player-btn"
                    title="Audio Tracks"
                    onClick={() => {
                      setShowAudioMenu(!showAudioMenu)
                      setShowSubtitleMenu(false)
                    }}
                  >
                    <AudioLines size={22} />
                  </button>
                  {showAudioMenu && (
                    <div
                      className="dropdown-menu"
                      style={{ bottom: '40px', top: 'auto', right: 0 }}
                    >
                      <div className="dropdown-item" style={{ color: '#fff', fontWeight: 700 }}>
                        Audio Track
                      </div>
                      {audioStreams.map((a) => (
                        <button
                          key={a.Index}
                          className="dropdown-item"
                          style={{
                            color: selectedAudioIndex === a.Index ? '#E50914' : 'inherit',
                          }}
                          onClick={() => {
                            setSelectedAudioIndex(a.Index)
                            setShowAudioMenu(false)
                            setIsHlsFallback(true)
                            startStream(true)
                          }}
                        >
                          {a.DisplayTitle || a.Language || `Track ${a.Index}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Subtitle stream selector */}
              {subtitleStreams.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <button
                    className="player-btn"
                    title="Subtitles"
                    onClick={() => {
                      setShowSubtitleMenu(!showSubtitleMenu)
                      setShowAudioMenu(false)
                    }}
                  >
                    <Subtitles size={22} />
                  </button>
                  {showSubtitleMenu && (
                    <div
                      className="dropdown-menu"
                      style={{ bottom: '40px', top: 'auto', right: 0 }}
                    >
                      <div className="dropdown-item" style={{ color: '#fff', fontWeight: 700 }}>
                        Subtitles
                      </div>
                      <button
                        className="dropdown-item"
                        style={{
                          color: selectedSubtitleIndex === undefined ? '#E50914' : 'inherit',
                        }}
                        onClick={() => {
                          setSelectedSubtitleIndex(undefined)
                          setShowSubtitleMenu(false)
                        }}
                      >
                        Off
                      </button>
                      {subtitleStreams.map((s) => (
                        <button
                          key={s.Index}
                          className="dropdown-item"
                          style={{
                            color: selectedSubtitleIndex === s.Index ? '#E50914' : 'inherit',
                          }}
                          onClick={() => {
                            setSelectedSubtitleIndex(s.Index)
                            setShowSubtitleMenu(false)
                            setIsHlsFallback(true)
                            startStream(true)
                          }}
                        >
                          {s.DisplayTitle || s.Language || `Subtitle ${s.Index}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
