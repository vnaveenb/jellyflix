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
  Download,
  CheckCircle2,
} from 'lucide-react'
import type {
  JellyfinItem,
  JellyfinMediaStream,
  MediaSegment,
  MediaSegmentType,
  TrickplayInfo,
} from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'
import { computeTrickplayFrame } from '../services/trickplay'
import { useAuth } from '../context/AuthContext'
import { useOffline } from '../context/OfflineContext'

const SKIPPABLE_SEGMENT_LABELS: Partial<Record<MediaSegmentType, string>> = {
  Intro: 'Skip Intro',
  Recap: 'Skip Recap',
  Preview: 'Skip Preview',
  Commercial: 'Skip Ad',
}

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
  onToggleFavorite?: (item: JellyfinItem) => void
  isOffline?: boolean
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ item: initialItem, onClose, isOffline = false }) => {
  const { downloadItem, isDownloaded, isDownloading, getDownloadProgress } = useOffline()
  const { user, token } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrubTrackRef = useRef<HTMLDivElement>(null)
  const mobileScrubTrackRef = useRef<HTMLDivElement>(null)
  const isScrubbingRef = useRef<boolean>(false)
  const scrubTimeRef = useRef<number>(0)
  const durationRef = useRef<number>(0)
  const wasPlayingBeforeScrub = useRef<boolean>(false)
  const hlsRef = useRef<Hls | null>(null)
  const progressIntervalRef = useRef<number | null>(null)
  const hideControlsTimerRef = useRef<number | null>(null)
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 })

  const [item, setItem] = useState<JellyfinItem>(initialItem)

  // startStream must not re-identify when these change, or the video would reload
  // every time the user toggles a subtitle track or the item object is refreshed.
  const itemRef = useRef<JellyfinItem>(initialItem)
  const selectedAudioIndexRef = useRef<number | undefined>(undefined)
  const selectedSubtitleIndexRef = useRef<number | undefined>(undefined)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isCinemaFullscreen, setIsCinemaFullscreen] = useState(false)
  const lastActionTimeRef = useRef(0)
  const safeTrigger = useCallback((fn: () => void) => (e: React.SyntheticEvent) => {
    e.stopPropagation()
    const now = Date.now()
    if (now - lastActionTimeRef.current < 250) return
    lastActionTimeRef.current = now
    fn()
  }, [])
  const [showControls, setShowControls] = useState(true)
  const [forceTranscode, setForceTranscode] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [showOverviewMore, setShowOverviewMore] = useState(false)

  // Viewport tracking for YouTube mobile vs Desktop cinema
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768)
  const [isPortrait, setIsPortrait] = useState(() => typeof window !== 'undefined' && window.innerHeight > window.innerWidth)

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768
      const portrait = window.innerHeight > window.innerWidth
      setIsMobile(mobile)
      setIsPortrait(portrait)
      if (document.fullscreenElement) {
        setIsFullscreen(true)
      } else {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    document.addEventListener('fullscreenchange', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
      document.removeEventListener('fullscreenchange', handleResize)
    }
  }, [])

  const isMobilePortrait = isMobile && isPortrait && !isCinemaFullscreen && !isFullscreen

  // Netflix Interactive Scrub Bar States
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubPosition, setScrubPosition] = useState(0)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverPercent, setHoverPercent] = useState<number>(0)
  const [hoverChapter, setHoverChapter] = useState<string | null>(null)

  // Seek Ripple feedback (+10 / -10)
  const [seekFeedback, setSeekFeedback] = useState<{ type: 'forward' | 'rewind'; amount: number } | null>(null)

  // Telemetry: Stats for Nerds
  const [showStatsForNerds, setShowStatsForNerds] = useState(false)
  const [droppedFrames, setDroppedFrames] = useState(0)

  // Audio & Subtitle menu
  const [showAudioSubModal, setShowAudioSubModal] = useState(false)
  const [audioStreams, setAudioStreams] = useState<JellyfinMediaStream[]>([])
  const [subtitleStreams, setSubtitleStreams] = useState<JellyfinMediaStream[]>([])
  const [selectedAudioIndex, setSelectedAudioIndex] = useState<number | undefined>(undefined)
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number | undefined>(undefined)
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([])
  const [activeSubtitleText, setActiveSubtitleText] = useState<string>('')
  const [isSubtitleLoading, setIsSubtitleLoading] = useState<boolean>(false)
  const [playMethod, setPlayMethod] = useState<'DirectPlay' | 'DirectStream' | 'Transcode'>('DirectPlay')
  const playSessionIdRef = useRef<string | undefined>(undefined)
  const mediaSourceIdRef = useRef<string | undefined>(undefined)

  // In-player Episodes
  const [showEpisodesDrawer, setShowEpisodesDrawer] = useState(false)
  const [seasons, setSeasons] = useState<JellyfinItem[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')
  const [seasonEpisodes, setSeasonEpisodes] = useState<JellyfinItem[]>([])
  const [nextEpisode, setNextEpisode] = useState<JellyfinItem | null>(null)
  const [showBingeCountdown, setShowBingeCountdown] = useState(false)
  const [countdownSeconds, setCountdownSeconds] = useState(10)

  // Chapters & Skip Intro
  const [mediaSegments, setMediaSegments] = useState<MediaSegment[]>([])
  const [activeSegment, setActiveSegment] = useState<MediaSegment | null>(null)
  const [trickplay, setTrickplay] = useState<{ info: TrickplayInfo; sourceId: string } | null>(null)

  // Scrub-bar thumbnail sheets, served natively by Jellyfin 12 when trickplay images exist.
  useEffect(() => {
    if (isOffline) {
      setTrickplay(null)
      return
    }
    const sourceId = item.MediaSources?.[0]?.Id || item.Id
    const info = jellyfinApi.selectTrickplayResolution(item.Trickplay, sourceId, 320)
    setTrickplay(info ? { info, sourceId } : null)
  }, [item.Trickplay, item.MediaSources, item.Id, isOffline])

  /** Maps a timestamp onto its tile within the generated trickplay sheet grid. */
  const trickplayFrameFor = useCallback(
    (timeSeconds: number) => {
      if (!trickplay) return null
      const frame = computeTrickplayFrame(trickplay.info, timeSeconds)
      if (!frame) return null
      return {
        ...frame,
        url: jellyfinApi.getTrickplayTileUrl(
          item.Id,
          trickplay.info.Width,
          frame.sheetIndex,
          trickplay.sourceId
        ),
      }
    },
    [trickplay, item.Id]
  )

  // Native media segments (Jellyfin 12) drive skip buttons and end-of-episode handoff.
  useEffect(() => {
    if (isOffline || item.Type === 'Series' || item.Type === 'Season') {
      setMediaSegments([])
      return
    }
    let cancelled = false
    jellyfinApi
      .getMediaSegments(item.Id, ['Intro', 'Outro', 'Recap', 'Preview', 'Commercial'])
      .then((segs) => {
        if (!cancelled) setMediaSegments(segs)
      })
    return () => {
      cancelled = true
    }
  }, [item.Id, item.Type, isOffline])

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
          // Fallback to overlay
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

  // Keep refs in sync so startStream can read current selections without re-identifying.
  useEffect(() => {
    itemRef.current = item
  }, [item])

  useEffect(() => {
    selectedAudioIndexRef.current = selectedAudioIndex
  }, [selectedAudioIndex])

  useEffect(() => {
    selectedSubtitleIndexRef.current = selectedSubtitleIndex
  }, [selectedSubtitleIndex])

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

  const reportProgress = useCallback(
    (paused: boolean, eventName = 'TimeUpdate') => {
      if (isOffline || !videoRef.current) return
      const currentSeconds = videoRef.current.currentTime
      const positionTicks = Math.floor(currentSeconds * 1000 * 10000)

      jellyfinApi.reportPlaybackProgress({
        ItemId: item.Id,
        MediaSourceId: mediaSourceIdRef.current,
        PlaySessionId: playSessionIdRef.current,
        PositionTicks: positionTicks,
        IsPaused: paused,
        PlayMethod: playMethod,
        EventName: eventName,
        AudioStreamIndex: selectedAudioIndex,
        SubtitleStreamIndex: selectedSubtitleIndex,
      })
    },
    [item.Id, isOffline, playMethod, selectedAudioIndex, selectedSubtitleIndex]
  )

  const startStream = useCallback(
    async (useTranscode: boolean, audioIdx?: number, seekSeconds?: number) => {
      const video = videoRef.current
      if (!video) return

      const current = itemRef.current

      if (current.Type === 'Series' || current.Type === 'Season') {
        console.warn('Cannot stream Series entity directly, waiting for episode resolution')
        return
      }

      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }

      const currentAudio = audioIdx !== undefined ? audioIdx : selectedAudioIndexRef.current

      const targetSeconds =
        seekSeconds !== undefined
          ? seekSeconds
          : video.currentTime > 0
          ? video.currentTime
          : (current.UserData?.PlaybackPositionTicks || 0) / (1000 * 10000)

      // Offline playback directly from service worker cache
      if (isOffline) {
        setPlayMethod('DirectPlay')
        video.src = `/offline-video/${current.Id}`
        video.onloadedmetadata = () => {
          if (targetSeconds > 0 && targetSeconds < (video.duration || 0) - 10) {
            video.currentTime = targetSeconds
          }
          video.play().catch(() => {})
        }
        return
      }

      if (!user) return

      // Jellyfin 12 negotiates the stream: the server picks direct play vs. remux vs. transcode.
      let info
      try {
        info = await jellyfinApi.getPlaybackInfo(current.Id, user.Id, {
          audioStreamIndex: currentAudio,
          startTimeTicks: targetSeconds > 0 ? Math.floor(targetSeconds * 1e7) : undefined,
        })
      } catch (err) {
        console.error('PlaybackInfo negotiation failed:', err)
        return
      }

      const source = info.MediaSources?.[0]
      if (!source) {
        console.error('No playable media source returned for item', current.Id)
        return
      }

      playSessionIdRef.current = info.PlaySessionId
      mediaSourceIdRef.current = source.Id

      // Prefer the untouched file unless the caller explicitly asked the server to transcode.
      const preferDirect = !useTranscode && (source.SupportsDirectPlay || source.SupportsDirectStream)
      const effective = preferDirect ? { ...source, TranscodingUrl: undefined } : source

      const resolved = jellyfinApi.resolvePlaybackUrl(current.Id, effective, info.PlaySessionId)
      setPlayMethod(resolved.playMethod)

      jellyfinApi.reportPlaybackStart({
        ItemId: current.Id,
        MediaSourceId: source.Id,
        PlaySessionId: info.PlaySessionId,
        AudioStreamIndex: currentAudio,
        SubtitleStreamIndex: selectedSubtitleIndexRef.current,
        PositionTicks: Math.floor(targetSeconds * 1e7),
        PlayMethod: resolved.playMethod,
      })

      if (resolved.isHls) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            backBufferLength: 30,
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
          hls.loadSource(resolved.url)
          hls.attachMedia(video)
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (targetSeconds > 0 && Math.abs(video.currentTime - targetSeconds) > 1) {
              video.currentTime = targetSeconds
            }
            video.play().catch(() => {})
          })
          hlsRef.current = hls
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = resolved.url
          video.onloadedmetadata = () => {
            if (targetSeconds > 0) video.currentTime = targetSeconds
            video.play().catch(() => {})
          }
        }
        return
      }

      video.src = resolved.url
      video.onloadedmetadata = () => {
        if (targetSeconds > 0 && targetSeconds < (video.duration || 0) - 10) {
          video.currentTime = targetSeconds
        }
        video.play().catch(() => {})
      }
      video.onerror = () => {
        if (!forceTranscode) {
          console.warn('Direct play failed; retrying via server transcode.')
          setForceTranscode(true)
        }
      }
    },
    [token, user, isOffline, forceTranscode]
  )

  useEffect(() => {
    void startStream(forceTranscode)
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [item.Id, forceTranscode, startStream])

  useEffect(() => {
    progressIntervalRef.current = window.setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        reportProgress(false)
        const v = videoRef.current as any
        if (v.getVideoPlaybackQuality) {
          setDroppedFrames(v.getVideoPlaybackQuality().droppedVideoFrames || 0)
        }
      }
    }, 10000)

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
      reportProgress(true, 'Stop')
    }
  }, [reportProgress])

  const handleMouseMove = () => {
    setShowControls(true)
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current)
    hideControlsTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !isScrubbingRef.current) {
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

    setSeekFeedback({
      type: seconds > 0 ? 'forward' : 'rewind',
      amount: Math.abs(seconds),
    })
    setTimeout(() => setSeekFeedback(null), 800)
  }

  // Double tap handler for mobile video
  const handleMobileVideoTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const now = Date.now()
    const touch = e.changedTouches[0]
    if (!touch) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = touch.clientX - rect.left
    const width = rect.width

    if (now - lastTapRef.current.time < 320) {
      // Double tap!
      if (x < width * 0.35) {
        skipSeconds(-10)
      } else if (x > width * 0.65) {
        skipSeconds(10)
      } else {
        togglePlay()
      }
      lastTapRef.current = { time: 0, x: 0 }
    } else {
      lastTapRef.current = { time: now, x }
      setShowControls((prev) => !prev)
    }
  }

  const calculateScrubTimeFromEvent = useCallback((clientX: number, targetRef?: React.RefObject<HTMLDivElement | null>) => {
    const track = targetRef?.current || scrubTrackRef.current || mobileScrubTrackRef.current
    if (!track) return { percent: 0, time: 0 }
    const rect = track.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    const percent = rect.width > 0 ? x / rect.width : 0
    const dur = durationRef.current || (videoRef.current?.duration || 0)
    const time = percent * dur
    return { percent: percent * 100, time }
  }, [])

  const getChapterForTime = useCallback(
    (time: number) => {
      if (!item.Chapters || item.Chapters.length === 0) return null
      const match = [...item.Chapters].reverse().find((c) => c.StartPositionTicks / 1e7 <= time)
      return match?.Name || null
    },
    [item.Chapters]
  )

  const handleScrubStart = (clientX: number, targetRef?: React.RefObject<HTMLDivElement | null>) => {
    const video = videoRef.current
    if (!video) return
    const { percent, time } = calculateScrubTimeFromEvent(clientX, targetRef)

    isScrubbingRef.current = true
    scrubTimeRef.current = time
    wasPlayingBeforeScrub.current = !video.paused

    setIsScrubbing(true)
    setScrubPosition(time)
    setHoverPercent(percent)
    setHoverTime(time)
    setHoverChapter(getChapterForTime(time))
  }

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

  useEffect(() => {
    const onWindowMouseMove = (e: MouseEvent) => {
      if (isScrubbingRef.current) handleScrubMove(e.clientX, true)
    }
    const onWindowMouseUp = () => {
      if (isScrubbingRef.current) handleScrubEnd()
    }
    const onWindowTouchMove = (e: TouchEvent) => {
      if (isScrubbingRef.current && e.touches.length > 0) {
        handleScrubMove(e.touches[0].clientX, true)
      }
    }
    const onWindowTouchEnd = () => {
      if (isScrubbingRef.current) handleScrubEnd()
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

  const toggleFullscreen = useCallback(() => {
    const isCurrentlyFs = isCinemaFullscreen || isFullscreen || !!document.fullscreenElement

    if (!isCurrentlyFs) {
      setIsCinemaFullscreen(true)
      setIsFullscreen(true)

      const container = containerRef.current
      if (container) {
        if (container.requestFullscreen) {
          container.requestFullscreen().catch(() => {})
        } else if ((container as any).webkitRequestFullscreen) {
          (container as any).webkitRequestFullscreen()
        }
      } else if (videoRef.current && (videoRef.current as any).webkitEnterFullscreen) {
        (videoRef.current as any).webkitEnterFullscreen()
      }

      try {
        if (screen.orientation && (screen.orientation as any).lock) {
          (screen.orientation as any).lock("landscape").catch(() => {})
        }
      } catch {}
    } else {
      setIsCinemaFullscreen(false)
      setIsFullscreen(false)

      if (document.fullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {})
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen()
        }
      }

      try {
        if (screen.orientation && (screen.orientation as any).unlock) {
          (screen.orientation as any).unlock()
        }
      } catch {}
    }
  }, [isCinemaFullscreen, isFullscreen])

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

  const handlePlayNextEpisode = () => {
    if (nextEpisode) {
      setShowBingeCountdown(false)
      setItem(nextEpisode)
      setForceTranscode(false)
    }
  }

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

    if (subtitleCues.length > 0) {
      const active = subtitleCues.find((c) => cTime >= c.start && cTime <= c.end)
      setActiveSubtitleText(active ? active.text : '')
    } else if (activeSubtitleText) {
      setActiveSubtitleText('')
    }

    if (mediaSegments.length > 0) {
      const ticks = cTime * 1e7
      const current = mediaSegments.find((s) => ticks >= s.StartTicks && ticks < s.EndTicks)
      setActiveSegment(current ?? null)
    }

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

  const videoStream = audioStreams.length > 0 ? item.MediaStreams?.find((s) => s.Type === 'Video') : null

  const resolutionLabel = (() => {
    const height = videoStream?.Height
    if (!height) return null
    if (height >= 2000) return '4K'
    if (height >= 1000) return '1080p'
    if (height >= 700) return '720p'
    return `${height}p`
  })()

  return (
    <div
      className={`video-player-container ${isMobilePortrait ? 'mobile-youtube-layout' : ''}`}
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={handleMouseMove}
    >
      {/* Loading state if resolving episode */}
      {(item.Type === 'Series' || item.Type === 'Season') && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#141414', zIndex: 60, gap: 16 }}>
          <div className="spinner" style={{ width: 44, height: 44, border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#E50914', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ color: '#aaa', fontSize: '0.95rem', letterSpacing: 0.5 }}>Loading Episode...</span>
        </div>
      )}

      {/* Main Video Viewport (Continuously mounted so streaming never restarts!) */}
      <div className="video-viewport-wrapper">
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
          onClick={!isMobilePortrait ? togglePlay : undefined}
        />

        {/* Dedicated touch gesture surface for mobile video */}
        {isMobilePortrait && (
          <div
            className="mobile-yt-gesture-surface"
            onTouchEnd={handleMobileVideoTouch}
          />
        )}

        {/* Subtitle Overlay */}
        {activeSubtitleText && (
          <div className={`netflix-subtitle-overlay ${isMobilePortrait ? 'mobile-yt-sub-pos' : ''}`}>
            <div className="netflix-subtitle-text">{activeSubtitleText}</div>
          </div>
        )}

        {/* Animated Center Seek Ripple (+10 / -10) */}
        {seekFeedback && (
          <div className="seek-ripple-overlay">
            <div className="seek-ripple-circle">
              {seekFeedback.type === 'forward' ? <RotateCw size={isMobilePortrait ? 32 : 42} /> : <RotateCcw size={isMobilePortrait ? 32 : 42} />}
              <span className="seek-ripple-text">
                {seekFeedback.type === 'forward' ? '+10' : '-10'}
              </span>
            </div>
          </div>
        )}

        {/* Skip Intro / Recap / Outro — driven by server-provided media segments */}
        {activeSegment && SKIPPABLE_SEGMENT_LABELS[activeSegment.Type] && (
          <button
            className="skip-intro-btn"
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = activeSegment.EndTicks / 1e7
                setActiveSegment(null)
              }
            }}
          >
            {SKIPPABLE_SEGMENT_LABELS[activeSegment.Type]}
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

        {/* --- MOBILE YOUTUBE OVERLAY (Shown on 16:9 docked video in portrait mode) --- */}
        {isMobilePortrait && (
          <div
            className={`mobile-yt-overlay ${showControls ? 'visible' : 'hidden'}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowControls(false)
              }
            }}
          >
            <div className="mobile-yt-top-row">
              <button
                className="mobile-yt-btn"
                onClick={safeTrigger(onClose)}
                onTouchEnd={safeTrigger(onClose)}
                aria-label="Back"
              >
                <ArrowLeft size={24} />
              </button>
              <span className="mobile-yt-header-title">{item.SeriesName || item.Name}</span>
              <div className="mobile-yt-top-actions">
                <button
                  className="mobile-yt-btn"
                  onClick={safeTrigger(() => setShowAudioSubModal(true))}
                  onTouchEnd={safeTrigger(() => setShowAudioSubModal(true))}
                  aria-label="Subtitles & Audio"
                >
                  <Subtitles size={22} />
                </button>
                <button
                  className="mobile-yt-btn"
                  onClick={safeTrigger(toggleFullscreen)}
                  onTouchEnd={safeTrigger(toggleFullscreen)}
                  aria-label="Fullscreen"
                >
                  <Maximize size={22} />
                </button>
              </div>
            </div>

            {/* Center Play/Rewind/Forward Controls */}
            <div className="mobile-yt-center-row">
              <button
                className="mobile-yt-center-btn"
                onClick={safeTrigger(() => skipSeconds(-10))}
                onTouchEnd={safeTrigger(() => skipSeconds(-10))}
                aria-label="Rewind 10s"
              >
                <RotateCcw size={28} />
                <span className="mobile-yt-seek-num">10</span>
              </button>

              <button
                className="mobile-yt-center-play-btn"
                onClick={safeTrigger(togglePlay)}
                onTouchEnd={safeTrigger(togglePlay)}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={34} fill="#fff" /> : <Play size={34} fill="#fff" />}
              </button>

              <button
                className="mobile-yt-center-btn"
                onClick={safeTrigger(() => skipSeconds(10))}
                onTouchEnd={safeTrigger(() => skipSeconds(10))}
                aria-label="Forward 10s"
              >
                <RotateCw size={28} />
                <span className="mobile-yt-seek-num">10</span>
              </button>
            </div>

            {/* Bottom mini scrub bar on mobile video */}
            <div className="mobile-yt-bottom-row">
              <span className="mobile-yt-time">{formatTime(isScrubbing ? scrubPosition : currentTime)}</span>
              <div
                className="mobile-yt-scrub-bar"
                ref={mobileScrubTrackRef}
                onTouchStart={(e) => {
                  e.stopPropagation()
                  if (e.touches.length > 0) handleScrubStart(e.touches[0].clientX, mobileScrubTrackRef)
                }}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                <div
                  className="mobile-yt-scrub-buf"
                  style={{ width: `${Math.min(100, (buffered / duration) * 100)}%` }}
                />
                <div
                  className="mobile-yt-scrub-prog"
                  style={{
                    width: `${Math.min(
                      100,
                      ((isScrubbing ? scrubPosition : currentTime) / duration) * 100
                    )}%`,
                  }}
                />
              </div>
              <span className="mobile-yt-time">{formatTime(duration)}</span>
              <button
                className="mobile-yt-btn"
                onClick={safeTrigger(toggleFullscreen)}
                onTouchEnd={safeTrigger(toggleFullscreen)}
                aria-label="Fullscreen"
              >
                <Maximize size={20} />
              </button>
            </div>
          </div>
        )}

        {/* --- DESKTOP & LANDSCAPE CINEMA CONTROLS OVERLAY --- */}
        {!isMobilePortrait && (
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
              <div
                className={`scrub-container ${isScrubbing ? 'is-scrubbing' : ''}`}
                ref={scrubTrackRef}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleScrubStart(e.clientX, scrubTrackRef)
                }}
                onTouchStart={(e) => {
                  if (e.touches.length > 0) handleScrubStart(e.touches[0].clientX, scrubTrackRef)
                }}
                onMouseMove={(e) => {
                  if (!isScrubbing) handleScrubMove(e.clientX, false)
                }}
                onMouseLeave={() => {
                  if (!isScrubbing) {
                    setHoverTime(null)
                    setHoverChapter(null)
                  }
                }}
              >
                {hoverTime !== null && duration > 0 && (() => {
                  const frame = trickplayFrameFor(hoverTime)
                  return (
                    <div
                      className="scrub-tooltip"
                      style={{
                        left: `${Math.max(2, Math.min(98, hoverPercent))}%`,
                      }}
                    >
                      {frame && (
                        <div
                          className="scrub-tooltip-thumb"
                          style={{
                            width: frame.width,
                            height: frame.height,
                            backgroundImage: `url("${frame.url}")`,
                            backgroundPosition: `${frame.offsetX}px ${frame.offsetY}px`,
                            backgroundSize: `${frame.sheetWidth}px ${frame.sheetHeight}px`,
                          }}
                        />
                      )}
                      <div className="scrub-tooltip-time">{formatTime(hoverTime)}</div>
                      {hoverChapter && <div className="scrub-tooltip-chapter">{hoverChapter}</div>}
                    </div>
                  )
                })()}

                <div className="scrub-track">
                  {duration > 0 && (
                    <div
                      className="scrub-buffered"
                      style={{ width: `${Math.min(100, (buffered / duration) * 100)}%` }}
                    />
                  )}
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

                  <button className="player-btn circular-seek-btn" onClick={() => skipSeconds(-10)} title="Rewind 10s">
                    <RotateCcw size={24} />
                    <span className="seek-number">10</span>
                  </button>

                  <button className="player-btn circular-seek-btn" onClick={() => skipSeconds(10)} title="Forward 10s">
                    <RotateCw size={24} />
                    <span className="seek-number">10</span>
                  </button>

                  <div className="volume-container desktop-volume-control">
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
                  {nextEpisode && (
                    <button
                      className="player-btn"
                      onClick={handlePlayNextEpisode}
                      title={`Next: ${nextEpisode.Name}`}
                    >
                      <SkipForward size={22} />
                    </button>
                  )}

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

                  <button className="player-btn" title="Picture in Picture" onClick={togglePiP}>
                    <PictureInPicture size={22} />
                  </button>

                  <button
                    className="player-btn"
                    title={isDownloaded(item.Id) ? "Downloaded to Device" : "Download to Device"}
                    onClick={() => {
                      if (!isDownloaded(item.Id) && !isDownloading(item.Id)) {
                        downloadItem(item)
                      }
                    }}
                  >
                    {isDownloaded(item.Id) ? (
                      <CheckCircle2 size={22} color="#46d369" />
                    ) : (
                      <Download size={22} />
                    )}
                  </button>

                  <button
                    className="player-btn"
                    title="Stats for Nerds (S)"
                    style={{ color: showStatsForNerds ? '#E50914' : 'inherit' }}
                    onClick={() => setShowStatsForNerds(!showStatsForNerds)}
                  >
                    <Activity size={22} />
                  </button>

                  <button className="player-btn" onClick={toggleFullscreen} title="Fullscreen (F)">
                    {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- YOUTUBE MOBILE SCROLLABLE CONTENT (Rendered below video in portrait mode) --- */}
      {isMobilePortrait && (
        <div className="mobile-yt-scroll-area">
          {/* Title & Metadata */}
          <div className="mobile-yt-meta-card">
            <h1 className="mobile-yt-show-name">{item.SeriesName || item.Name}</h1>
            {item.SeriesName && (
              <div className="mobile-yt-ep-name">
                {item.SeasonName ? `${item.SeasonName} • ` : ''}
                {item.IndexNumber ? `Episode ${item.IndexNumber}: ` : ''}
                {item.Name}
              </div>
            )}
            <div className="mobile-yt-tags-row">
              {item.ProductionYear && <span className="yt-tag">{item.ProductionYear}</span>}
              {item.OfficialRating && <span className="yt-tag rating">{item.OfficialRating}</span>}
              {resolutionLabel && <span className="yt-tag hd">{resolutionLabel}</span>}
              {item.CommunityRating && (
                <span className="yt-tag match">{item.CommunityRating.toFixed(1)}</span>
              )}
            </div>
            {item.Overview && (
              <div className="mobile-yt-overview-box">
                <p className="mobile-yt-overview-text">
                  {showOverviewMore ? item.Overview : `${item.Overview.slice(0, 110)}`}
                  {item.Overview.length > 110 && (
                    <button
                      className="mobile-yt-more-link"
                      onClick={() => setShowOverviewMore(!showOverviewMore)}
                    >
                      {showOverviewMore ? ' Show less' : ' ...more'}
                    </button>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Quick Action Pills Row (YouTube style) */}
          <div className="mobile-yt-action-pills">
            <button
              className="yt-pill-btn"
              onClick={safeTrigger(() => setShowAudioSubModal(true))}
              onTouchEnd={safeTrigger(() => setShowAudioSubModal(true))}
            >
              <Subtitles size={16} color="#E50914" />
              <span>Audio / Subs</span>
            </button>

            <button
              className="yt-pill-btn"
              onClick={() => {
                const speeds = [1, 1.25, 1.5, 2, 0.75]
                const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length
                const newSpeed = speeds[nextIdx]
                setPlaybackSpeed(newSpeed)
                if (videoRef.current) videoRef.current.playbackRate = newSpeed
              }}
            >
              <Gauge size={16} />
              <span>{playbackSpeed}x</span>
            </button>

            {nextEpisode && (
              <button className="yt-pill-btn" onClick={handlePlayNextEpisode}>
                <SkipForward size={16} color="#E50914" />
                <span>Next Ep</span>
              </button>
            )}

            <button
              className="yt-pill-btn"
              onClick={safeTrigger(() => {
                if (!isDownloaded(item.Id) && !isDownloading(item.Id)) {
                  downloadItem(item)
                }
              })}
              onTouchEnd={safeTrigger(() => {
                if (!isDownloaded(item.Id) && !isDownloading(item.Id)) {
                  downloadItem(item)
                }
              })}
            >
              {isDownloaded(item.Id) ? (
                <CheckCircle2 size={16} color="#46d369" />
              ) : isDownloading(item.Id) ? (
                <Download size={16} color="#E50914" />
              ) : (
                <Download size={16} />
              )}
              <span>
                {isDownloaded(item.Id)
                  ? "Downloaded"
                  : isDownloading(item.Id)
                  ? `${getDownloadProgress(item.Id)}%`
                  : "Download"}
              </span>
            </button>

            <button
              className="yt-pill-btn"
              onClick={() => setShowStatsForNerds(!showStatsForNerds)}
            >
              <Activity size={16} />
              <span>Stats</span>
            </button>
          </div>

          {/* Next Episode Up Next Banner */}
          {nextEpisode && (
            <div className="mobile-yt-next-card" onClick={handlePlayNextEpisode}>
              <div className="mobile-yt-next-info">
                <span className="mobile-yt-next-label">UP NEXT</span>
                <span className="mobile-yt-next-title">
                  {nextEpisode.IndexNumber ? `Ep ${nextEpisode.IndexNumber}: ` : ''}
                  {nextEpisode.Name}
                </span>
              </div>
              <button className="mobile-yt-next-play-icon" aria-label="Play Next">
                <Play size={18} fill="#fff" />
              </button>
            </div>
          )}

          {/* Inline Season Episodes List (YouTube Playlist style) */}
          {item.SeriesId && seasonEpisodes.length > 0 && (
            <div className="mobile-yt-episodes-block">
              <div className="mobile-yt-episodes-bar">
                <span className="mobile-yt-episodes-heading">Episodes</span>
                {seasons.length > 1 && (
                  <select
                    className="mobile-yt-season-dropdown"
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
              </div>

              <div className="mobile-yt-episodes-list">
                {seasonEpisodes.map((ep, idx) => {
                  const isCurrent = ep.Id === item.Id
                  const epThumb = jellyfinApi.getImageUrl(ep.Id, 'Primary', { maxWidth: 220, quality: 75 })
                  return (
                    <div
                      key={ep.Id}
                      className={`mobile-yt-episode-row ${isCurrent ? 'active-playing' : ''}`}
                      onClick={() => {
                        if (!isCurrent) {
                          setItem(ep)
                          setForceTranscode(false)
                        }
                      }}
                    >
                      <div className="mobile-yt-thumb-box">
                        <img src={epThumb} alt={ep.Name} className="mobile-yt-thumb-img" />
                        <span className="mobile-yt-thumb-num">{ep.IndexNumber ?? idx + 1}</span>
                        {isCurrent && (
                          <div className="mobile-yt-playing-pill">
                            <span>PLAYING</span>
                          </div>
                        )}
                      </div>
                      <div className="mobile-yt-ep-meta">
                        <div className="mobile-yt-ep-title-text" style={{ color: isCurrent ? '#E50914' : '#fff' }}>
                          {ep.Name}
                        </div>
                        <div className="mobile-yt-ep-runtime">
                          {ep.RunTimeTicks ? formatTime(ep.RunTimeTicks / 1e7) : ''}
                        </div>
                        {ep.Overview && (
                          <div className="mobile-yt-ep-synopsis">{ep.Overview}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
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
              {playMethod === 'DirectPlay'
                ? 'Direct Play (original file, no server CPU)'
                : playMethod === 'DirectStream'
                ? 'Direct Stream (container remux)'
                : 'Transcode (server re-encoding)'}
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
              {audioStreams.find((a) => a.Index === selectedAudioIndex)?.DisplayTitle || 'Default Audio'}
            </span>
          </div>
          <div className="nerd-stat">
            <span>Resolution:</span>
            <span>{videoStream?.Width ? `${videoStream.Width}x${videoStream.Height}` : `${videoRef.current?.videoWidth || 1920}x${videoRef.current?.videoHeight || 1080}`}</span>
          </div>
          <div className="nerd-stat">
            <span>Dropped Frames:</span>
            <span>{droppedFrames}</span>
          </div>
          <div className="nerd-stat">
            <span>Buffer:</span>
            <span>{(buffered - currentTime).toFixed(1)}s ahead</span>
          </div>
        </div>
      )}

      {/* Episodes Drawer (Desktop & Landscape) */}
      {showEpisodesDrawer && !isMobilePortrait && (
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
                      setForceTranscode(false)
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

      {/* Audio & Subtitles Modal (Responsive for Mobile & Desktop) */}
      {showAudioSubModal && (
        <div
          className="audio-sub-modal-overlay"
          onClick={() => setShowAudioSubModal(false)}
          onTouchEnd={(e) => {
            if (e.target === e.currentTarget) setShowAudioSubModal(false)
          }}
        >
          <div
            className="audio-sub-modal"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <div className="audio-sub-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Audio & Subtitles</h3>
              <button
                onClick={safeTrigger(() => setShowAudioSubModal(false))}
                onTouchEnd={safeTrigger(() => setShowAudioSubModal(false))}
                style={{ color: '#fff', background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}
                aria-label="Close"
              >
                <X size={24} />
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
                          const currentSec = videoRef.current?.currentTime || 0
                          // Re-negotiate: the server decides whether the new track needs a remux.
                          void startStream(false, a.Index, currentSec)
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
                    onClick={() => setSelectedSubtitleIndex(undefined)}
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
                        onClick={() => setSelectedSubtitleIndex(s.Index)}
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
    </div>
  )
}
