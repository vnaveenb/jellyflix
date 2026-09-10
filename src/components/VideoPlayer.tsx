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

interface SubtitleCue {
  start: number
  end: number
  text: string
}

function parseVttTimeToSeconds(timeStr: string): number {
  const parts = timeStr.trim().split(':')
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0
    const minutes = parseFloat(parts[1]) || 0
    const seconds = parseFloat(parts[2].replace(',', '.')) || 0
    return hours * 3600 + minutes * 60 + seconds
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]) || 0
    const seconds = parseFloat(parts[1].replace(',', '.')) || 0
    return minutes * 60 + seconds
  }
  return 0
}

function parseVtt(vttText: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  const lines = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()
    if (line.includes('-->')) {
      const [startStr, rawEndStr] = line.split('-->')
      const endStr = rawEndStr ? rawEndStr.trim().split(/\s+/)[0] : ''
      const start = parseVttTimeToSeconds(startStr)
      const end = parseVttTimeToSeconds(endStr)

      i++
      const textLines: string[] = []
      while (i < lines.length && lines[i].trim() !== '') {
        const cleanText = lines[i].replace(/<[^>]+>/g, '').trim()
        if (cleanText) textLines.push(cleanText)
        i++
      }
      if (textLines.length > 0) {
        cues.push({ start, end, text: textLines.join('\n') })
      }
    } else {
      i++
    }
  }
  return cues
}

interface VideoPlayerProps {
  item: JellyfinItem
  onClose: () => void
  onNextEpisode?: (nextItem: JellyfinItem) => void
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ item: initialItem, onClose }) => {
  const { user, token } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrubTrackRef = useRef<HTMLDivElement>(null)
  const isScrubbingRef = useRef<boolean>(false)
  const scrubTimeRef = useRef<number>(0)
  const durationRef = useRef<number>(0)
  const wasPlayingBeforeScrub = useRef<boolean>(false)
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

  // Netflix Interactive Scrub Bar States
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubPosition, setScrubPosition] = useState(0)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverPercent, setHoverPercent] = useState<number>(0)
  const [hoverChapter, setHoverChapter] = useState<string | null>(null)

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
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([])
  const [activeSubtitleText, setActiveSubtitleText] = useState<string>('')
  const [isSubtitleLoading, setIsSubtitleLoading] = useState<boolean>(false)
  const [isAudioRemux, setIsAudioRemux] = useState<boolean>(false)

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
    if (!user || item.Type === 'Series' || item.Type === 'Season') return
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

  // Zero-transcode WebVTT Subtitle loading effect
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Clean up any existing native tracks
    while (video.getElementsByTagName('track').length > 0) {
      video.removeChild(video.getElementsByTagName('track')[0])
    }

    if (selectedSubtitleIndex === undefined) {
      setSubtitleCues([])
      setActiveSubtitleText('')
      return
    }

    const mediaSourceId = item.MediaSources?.[0]?.Id || item.Id
    setIsSubtitleLoading(true)

    jellyfinApi
      .fetchSubtitleVtt(item.Id, mediaSourceId, selectedSubtitleIndex)
      .then((vttText) => {
        const cues = parseVtt(vttText)
        setSubtitleCues(cues)
        setIsSubtitleLoading(false)

        // Dynamically attach native WebVTT track for native PiP & Fullscreen compatibility
        try {
          const blob = new Blob([vttText], { type: 'text/vtt' })
          const blobUrl = URL.createObjectURL(blob)
          const track = document.createElement('track')
          track.kind = 'subtitles'
          track.label = 'Subtitles'
          track.srclang = 'en'
          track.src = blobUrl
          track.default = true
          video.appendChild(track)
        } catch {
          // Fallback to React overlay only
        }
      })
      .catch((err) => {
        console.warn('Could not fetch WebVTT subtitle directly:', err)
        setIsSubtitleLoading(false)
      })
  }, [selectedSubtitleIndex, item.Id, item.MediaSources])

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

  // Start stream (Direct play for native mp4/webm, HLS stream copy remux for mkv/transcoded audio)
  const startStream = useCallback(
    (useHls: boolean, audioIdx?: number, seekSeconds?: number) => {
      const video = videoRef.current
      if (!video) return

      // TV Series / Seasons are containers, not playable streams
      if (item.Type === 'Series' || item.Type === 'Season') {
        console.warn('Cannot stream Series entity directly, waiting for episode resolution')
        return
      }

      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }

      const currentAudio = audioIdx !== undefined ? audioIdx : selectedAudioIndex
      const defaultAudio = audioStreams.find((s) => s.IsDefault) || audioStreams[0]
      const isAlternateAudio = defaultAudio && currentAudio !== undefined && currentAudio !== defaultAudio.Index

      const targetSeconds =
        seekSeconds !== undefined
          ? seekSeconds
          : video.currentTime > 0
          ? video.currentTime
          : (item.UserData?.PlaybackPositionTicks || 0) / (1000 * 10000)
      const targetTicks = Math.floor(targetSeconds * 1000 * 10000)

      const container = (item.Container || item.MediaSources?.[0]?.Container || '').toLowerCase()
      // Web browsers cannot perform instant random seeking in raw MKV files over HTTP byte ranges
      const isDirectCompatible = (container === 'mp4' || container === 'm4v' || container === 'webm') && !isAlternateAudio && !useHls

      if (isDirectCompatible) {
        setIsAudioRemux(false)
        const directUrl = jellyfinApi.getDirectStreamUrl(item.Id)
        video.src = directUrl

        video.onloadedmetadata = () => {
          if (targetSeconds > 0 && targetSeconds < (video.duration || 0) - 10) {
            video.currentTime = targetSeconds
          }
          video.play().catch(() => {})
        }

        video.onerror = () => {
          console.warn('Direct Play failed. Falling back to Jellyfin Direct Stream Remux...')
          setIsHlsFallback(true)
          setIsAudioRemux(true)
          startStream(true, currentAudio, video.currentTime || targetSeconds)
        }
      } else {
        setIsAudioRemux(true)
        const hlsUrl = jellyfinApi.getHlsStreamUrl(item.Id, {
          audioStreamIndex: currentAudio,
          videoCodec: 'copy', // Stream copy video (ZERO CPU/GPU transcoding!)
          audioCodec: 'aac,mp3',
        })

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            backBufferLength: 30, // Retain 30s buffer for instant 0ms 10s rewinds!
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            maxBufferSize: 60 * 1000 * 1000,
            lowLatencyMode: false,
            autoStartLoad: true,
            startPosition: targetSeconds > 0 ? targetSeconds : -1,
            xhrSetup: (xhr) => {
              const authToken = token || jellyfinApi.getToken()
              if (authToken) {
                xhr.setRequestHeader('Authorization', `MediaBrowser Token="${authToken}"`)
                xhr.setRequestHeader('X-MediaBrowser-Token', authToken)
              }
            },
          })
          hls.loadSource(hlsUrl)
          hls.attachMedia(video)
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (targetSeconds > 0 && Math.abs(video.currentTime - targetSeconds) > 1) {
              video.currentTime = targetSeconds
            }
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
          video.onloadedmetadata = () => {
            if (targetSeconds > 0) {
              video.currentTime = targetSeconds
            }
            video.play().catch(() => {})
          }
        }
      }

      jellyfinApi.reportPlaybackStart({
        ItemId: item.Id,
        PositionTicks: targetTicks,
        IsPaused: false,
        PlayMethod: isDirectCompatible ? 'DirectPlay' : 'DirectStream',
      })
    },
    [item, selectedAudioIndex, audioStreams, token]
  )

  useEffect(() => {
    // If passed a Series or Season, resolve the playable episode first!
    if (item.Type === 'Series' || item.Type === 'Season') {
      if (!user) return
      const seriesId = item.Type === 'Series' ? item.Id : (item.SeriesId || item.Id)
      jellyfinApi
        .getNextUp(user.Id, seriesId)
        .then((nextUp) => {
          if (nextUp?.Items && nextUp.Items.length > 0) {
            setItem(nextUp.Items[0])
            return
          }
          jellyfinApi.getEpisodes(seriesId, undefined, user.Id).then((eps) => {
            if (eps?.Items && eps.Items.length > 0) {
              setItem(eps.Items[0])
            }
          })
        })
        .catch((err) => {
          console.error('Failed to resolve episode for series playback:', err)
        })
      return
    }

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
  }, [startStream, isHlsFallback, item.Id, item.Type, reportProgress, user])

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

  // Calculate percentage and target seconds from clientX on scrubber
  const calculateScrubTimeFromEvent = useCallback((clientX: number) => {
    const track = scrubTrackRef.current
    if (!track) return { percent: 0, time: 0 }
    const rect = track.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    const percent = rect.width > 0 ? x / rect.width : 0
    const dur = durationRef.current || (videoRef.current?.duration || 0)
    const time = percent * dur
    return { percent: percent * 100, time }
  }, [])

  // Find chapter for a given time
  const getChapterForTime = useCallback(
    (time: number) => {
      if (!item.Chapters || item.Chapters.length === 0) return null
      const match = [...item.Chapters].reverse().find((c) => c.StartPositionTicks / 1e7 <= time)
      return match?.Name || null
    },
    [item.Chapters]
  )

  // Start scrubbing on mouse/touch down
  const handleScrubStart = (clientX: number) => {
    const video = videoRef.current
    if (!video) return
    const { percent, time } = calculateScrubTimeFromEvent(clientX)

    isScrubbingRef.current = true
    scrubTimeRef.current = time
    wasPlayingBeforeScrub.current = !video.paused

    setIsScrubbing(true)
    setScrubPosition(time)
    setHoverPercent(percent)
    setHoverTime(time)
    setHoverChapter(getChapterForTime(time))
  }

  // Scrub move (hover or active drag)
  const handleScrubMove = useCallback(
    (clientX: number, isDragging: boolean) => {
      const { percent, time } = calculateScrubTimeFromEvent(clientX)
      setHoverPercent(percent)
      setHoverTime(time)
      setHoverChapter(getChapterForTime(time))

      if (isDragging) {
        scrubTimeRef.current = time
        setScrubPosition(time)
      }
    },
    [calculateScrubTimeFromEvent, getChapterForTime]
  )

  // Commit seek on mouse/touch release
  const handleScrubEnd = useCallback(() => {
    if (!isScrubbingRef.current) return
    isScrubbingRef.current = false
    setIsScrubbing(false)

    const video = videoRef.current
    if (!video) return

    const commitTime = scrubTimeRef.current
    video.currentTime = commitTime
    setCurrentTime(commitTime)
    reportProgress(video.paused, 'Seek')

    if (wasPlayingBeforeScrub.current && video.paused) {
      video.play().catch(() => {})
    }
  }, [reportProgress])

  // Global window listeners for drag scrubbing outside track bounds
  useEffect(() => {
    const onWindowMouseMove = (e: MouseEvent) => {
      if (isScrubbingRef.current) {
        handleScrubMove(e.clientX, true)
      }
    }
    const onWindowMouseUp = () => {
      if (isScrubbingRef.current) {
        handleScrubEnd()
      }
    }
    const onWindowTouchMove = (e: TouchEvent) => {
      if (isScrubbingRef.current && e.touches.length > 0) {
        handleScrubMove(e.touches[0].clientX, true)
      }
    }
    const onWindowTouchEnd = () => {
      if (isScrubbingRef.current) {
        handleScrubEnd()
      }
    }

    window.addEventListener('mousemove', onWindowMouseMove)
    window.addEventListener('mouseup', onWindowMouseUp)
    window.addEventListener('touchmove', onWindowTouchMove, { passive: true })
    window.addEventListener('touchend', onWindowTouchEnd)

    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove)
      window.removeEventListener('mouseup', onWindowMouseUp)
      window.removeEventListener('touchmove', onWindowTouchMove)
      window.removeEventListener('touchend', onWindowTouchEnd)
    }
  }, [handleScrubMove, handleScrubEnd])

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

  // Chapter intro skip check, subtitle cue update & end-of-episode countdown check
  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return
    const cTime = video.currentTime
    const dur = video.duration || duration
    durationRef.current = dur
    if (!isScrubbingRef.current) {
      setCurrentTime(cTime)
    }

    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1))
    }

    // Subtitle cue matching (0% CPU, instant text sync)
    if (subtitleCues.length > 0) {
      const active = subtitleCues.find((c) => cTime >= c.start && cTime <= c.end)
      setActiveSubtitleText(active ? active.text : '')
    } else if (activeSubtitleText) {
      setActiveSubtitleText('')
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
      {/* Loading state if resolving episode */}
      {(item.Type === 'Series' || item.Type === 'Season') && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#141414', zIndex: 10, gap: 16 }}>
          <div className="spinner" style={{ width: 44, height: 44, border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#E50914', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ color: '#aaa', fontSize: '0.95rem', letterSpacing: 0.5 }}>Loading Episode...</span>
        </div>
      )}
      <video
        ref={videoRef}
        className="video-element"
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={() => {
          if (videoRef.current) {
            setDuration(videoRef.current.duration)
            durationRef.current = videoRef.current.duration
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={togglePlay}
      />

      {/* Netflix-Style Subtitle Overlay (0% CPU, Native WebVTT render) */}
      {activeSubtitleText && (
        <div className="netflix-subtitle-overlay">
          <div className="netflix-subtitle-text">{activeSubtitleText}</div>
        </div>
      )}

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
            <strong style={{ color: '#46d369' }}>
              {isAudioRemux
                ? 'Direct Stream Remux (HLS Video Copy 0% CPU)'
                : 'Direct Play (Native MP4 0% CPU)'}
            </strong>
          </div>
          <div className="nerd-stat">
            <span>Active Subtitle:</span>
            <strong style={{ color: selectedSubtitleIndex !== undefined ? '#46d369' : '#888' }}>
              {selectedSubtitleIndex !== undefined
                ? `${subtitleStreams.find((s) => s.Index === selectedSubtitleIndex)?.DisplayTitle || 'Subtitle'} (WebVTT Direct 0% CPU)`
                : 'Off'}
            </strong>
          </div>
          <div className="nerd-stat">
            <span>Active Audio:</span>
            <span>
              {audioStreams.find((a) => a.Index === selectedAudioIndex)?.DisplayTitle || 'Default Audio'} ({isAudioRemux ? 'Remux Copy' : 'Direct'})
            </span>
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
            <span>{audioStreams.find((a) => a.Index === selectedAudioIndex)?.Codec?.toUpperCase() || 'AAC'} ({audioStreams.find((a) => a.Index === selectedAudioIndex)?.Channels ? `${audioStreams.find((a) => a.Index === selectedAudioIndex)?.Channels}ch` : '2ch Stereo'})</span>
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
            <div className="audio-sub-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Audio & Subtitles</h3>
              <button onClick={() => setShowAudioSubModal(false)} style={{ color: '#fff' }}>
                <X size={20} />
              </button>
            </div>

            <div className="audio-sub-grid">
              {/* Left: Audio */}
              <div className="audio-sub-column">
                <h4 className="audio-sub-col-title">Audio</h4>
                <div className="audio-sub-list">
                  {audioStreams.map((a) => {
                    const isSelected = selectedAudioIndex === a.Index
                    const channelStr = a.Channels === 6 ? '5.1' : a.Channels === 8 ? '7.1' : 'Stereo'
                    return (
                      <button
                        key={a.Index}
                        className={`audio-sub-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          if (selectedAudioIndex === a.Index) return
                          setSelectedAudioIndex(a.Index)
                          const defaultAudio = audioStreams.find((s) => s.IsDefault) || audioStreams[0]
                          const isDefault = defaultAudio && a.Index === defaultAudio.Index
                          const currentSec = videoRef.current?.currentTime || 0

                          if (isDefault) {
                            setIsHlsFallback(false)
                            setIsAudioRemux(false)
                            startStream(false, a.Index, currentSec)
                          } else {
                            setIsHlsFallback(true)
                            setIsAudioRemux(true)
                            startStream(true, a.Index, currentSec)
                          }
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
                <h4 className="audio-sub-col-title">
                  Subtitles {isSubtitleLoading && <span style={{ fontSize: '0.8rem', color: '#E50914' }}>(Loading...)</span>}
                </h4>
                <div className="audio-sub-list">
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
                    const isText = s.IsTextSubtitleStream !== false && s.Codec !== 'PGSSUB'
                    return (
                      <button
                        key={s.Index}
                        className={`audio-sub-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedSubtitleIndex(s.Index)
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {isSelected ? <Check size={16} color="#E50914" /> : <div style={{ width: 16 }} />}
                          <span>{s.DisplayTitle || s.Language || `Subtitle ${s.Index}`}</span>
                        </div>
                        <span className="audio-badge">
                          {isText ? '0% CPU' : (s.Codec?.toUpperCase() || 'SUB')}
                        </span>
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
          {/* Netflix Interactive Debounced Scrub Bar */}
          <div
            className={`scrub-container ${isScrubbing ? 'is-scrubbing' : ''}`}
            ref={scrubTrackRef}
            onMouseDown={(e) => {
              e.preventDefault()
              handleScrubStart(e.clientX)
            }}
            onTouchStart={(e) => {
              if (e.touches.length > 0) {
                handleScrubStart(e.touches[0].clientX)
              }
            }}
            onMouseMove={(e) => {
              if (!isScrubbing) {
                handleScrubMove(e.clientX, false)
              }
            }}
            onMouseLeave={() => {
              if (!isScrubbing) {
                setHoverTime(null)
                setHoverChapter(null)
              }
            }}
          >
            {/* Floating Hover/Drag Tooltip */}
            {hoverTime !== null && duration > 0 && (
              <div
                className="scrub-tooltip"
                style={{
                  left: `${Math.max(2, Math.min(98, hoverPercent))}%`,
                }}
              >
                <div className="scrub-tooltip-time">{formatTime(hoverTime)}</div>
                {hoverChapter && <div className="scrub-tooltip-chapter">{hoverChapter}</div>}
              </div>
            )}

            <div className="scrub-track">
              {/* Buffered bar */}
              {duration > 0 && (
                <div
                  className="scrub-buffered"
                  style={{ width: `${Math.min(100, (buffered / duration) * 100)}%` }}
                />
              )}
              {/* Active Progress bar */}
              {duration > 0 && (
                <div
                  className="scrub-progress"
                  style={{
                    width: `${Math.min(
                      100,
                      ((isScrubbing ? scrubPosition : currentTime) / duration) * 100
                    )}%`,
                  }}
                />
              )}
              {/* Scrub Thumb Handle */}
              {duration > 0 && (
                <div
                  className={`scrub-thumb ${isScrubbing ? 'active' : ''}`}
                  style={{
                    left: `${Math.min(
                      100,
                      ((isScrubbing ? scrubPosition : currentTime) / duration) * 100
                    )}%`,
                  }}
                />
              )}

              {/* Chapter Boundary Notches */}
              {duration > 0 &&
                item.Chapters &&
                item.Chapters.map((chap, idx) => {
                  const sec = chap.StartPositionTicks / 1e7
                  if (sec <= 0 || sec >= duration) return null
                  const pct = (sec / duration) * 100
                  return (
                    <div
                      key={idx}
                      className="scrub-chapter-marker"
                      style={{ left: `${pct}%` }}
                      title={chap.Name}
                    />
                  )
                })}
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
                {formatTime(isScrubbing ? scrubPosition : currentTime)} / {formatTime(duration)}
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
