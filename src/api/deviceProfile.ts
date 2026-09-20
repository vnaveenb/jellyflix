/**
 * Builds a Jellyfin DeviceProfile by probing what this browser can actually decode.
 *
 * Jellyfin 12 removed the hand-built `/Videos/{id}/master.m3u8` route. Playback is now
 * negotiated: POST this profile to /Items/{id}/PlaybackInfo and the server decides
 * direct play vs. remux vs. transcode and returns the URL to use.
 */

export interface DirectPlayProfile {
  Container: string
  Type: 'Video' | 'Audio'
  VideoCodec?: string
  AudioCodec?: string
}

export interface TranscodingProfile {
  Container: string
  Type: 'Video' | 'Audio'
  VideoCodec?: string
  AudioCodec: string
  Protocol: 'http' | 'hls'
  Context: 'Streaming' | 'Static'
  MaxAudioChannels?: string
  MinSegments?: number
  BreakOnNonKeyFrames?: boolean
  CopyTimestamps?: boolean
  EnableSubtitlesInManifest?: boolean
}

export interface SubtitleProfile {
  Format: string
  Method: 'Encode' | 'Embed' | 'External' | 'Hls' | 'Drop'
}

export interface DeviceProfile {
  Name: string
  MaxStreamingBitrate: number
  MaxStaticBitrate: number
  MusicStreamingTranscodingBitrate: number
  DirectPlayProfiles: DirectPlayProfile[]
  TranscodingProfiles: TranscodingProfile[]
  SubtitleProfiles: SubtitleProfile[]
  ContainerProfiles: unknown[]
  CodecProfiles: unknown[]
}

const CODEC_TESTS: Record<string, string[]> = {
  h264: ['video/mp4; codecs="avc1.640029"'],
  hevc: ['video/mp4; codecs="hvc1.1.6.L153.B0"', 'video/mp4; codecs="hev1.1.6.L153.B0"'],
  av1: ['video/mp4; codecs="av01.0.15M.10"'],
  vp9: ['video/webm; codecs="vp9"'],
  aac: ['audio/mp4; codecs="mp4a.40.2"'],
  opus: ['audio/webm; codecs="opus"'],
  flac: ['audio/mp4; codecs="flac"'],
  mp3: ['audio/mp4; codecs="mp4a.69"', 'audio/mpeg'],
  ac3: ['audio/mp4; codecs="ac-3"'],
  eac3: ['audio/mp4; codecs="ec-3"'],
}

function canPlay(video: HTMLVideoElement, mimeList: string[]): boolean {
  return mimeList.some((mime) => video.canPlayType(mime) !== '')
}

function probeCodecs(): Set<string> {
  const supported = new Set<string>()
  if (typeof document === 'undefined') {
    // Non-browser (SSR/test) fallback: assume the baseline every browser ships.
    return new Set(['h264', 'aac', 'mp3'])
  }
  const video = document.createElement('video')
  for (const [codec, mimes] of Object.entries(CODEC_TESTS)) {
    if (canPlay(video, mimes)) supported.add(codec)
  }
  supported.add('h264')
  supported.add('aac')
  return supported
}

/**
 * Surround audio is only forwarded untouched when the output device can actually
 * render it; otherwise the server must downmix or the user gets silence.
 */
function maxAudioChannels(): number {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return 2
  try {
    const ctx = new AudioContext()
    const channels = ctx.destination.maxChannelCount
    void ctx.close()
    return channels > 2 ? Math.min(channels, 8) : 2
  } catch {
    return 2
  }
}

export function buildDeviceProfile(maxStreamingBitrate = 120_000_000): DeviceProfile {
  const codecs = probeCodecs()
  const channels = maxAudioChannels()

  const videoCodecs = ['h264', 'hevc', 'av1', 'vp9'].filter((c) => codecs.has(c))
  const audioCodecs = ['aac', 'mp3', 'opus', 'flac', 'ac3', 'eac3'].filter((c) => codecs.has(c))

  const directPlayProfiles: DirectPlayProfile[] = [
    {
      Container: 'mp4,m4v',
      Type: 'Video',
      VideoCodec: videoCodecs.join(','),
      AudioCodec: audioCodecs.join(','),
    },
    {
      Container: 'webm',
      Type: 'Video',
      VideoCodec: ['vp9', 'av1'].filter((c) => codecs.has(c)).join(',') || 'vp8',
      AudioCodec: ['opus', 'vorbis'].join(','),
    },
    { Container: 'mp3', Type: 'Audio' },
    { Container: 'flac', Type: 'Audio' },
    { Container: 'm4a', Type: 'Audio', AudioCodec: 'aac' },
  ]

  const transcodingProfiles: TranscodingProfile[] = [
    {
      // Preferred path: copy the video bitstream, only touch audio. Near-zero server CPU.
      Container: 'ts',
      Type: 'Video',
      VideoCodec: videoCodecs.join(','),
      AudioCodec: audioCodecs.join(','),
      Protocol: 'hls',
      Context: 'Streaming',
      MaxAudioChannels: String(channels),
      MinSegments: 2,
      BreakOnNonKeyFrames: true,
      EnableSubtitlesInManifest: false,
    },
    {
      Container: 'mp4',
      Type: 'Video',
      VideoCodec: 'h264',
      AudioCodec: 'aac',
      Protocol: 'http',
      Context: 'Static',
      MaxAudioChannels: String(channels),
    },
    {
      Container: 'mp3',
      Type: 'Audio',
      AudioCodec: 'mp3',
      Protocol: 'http',
      Context: 'Streaming',
    },
  ]

  const subtitleProfiles: SubtitleProfile[] = [
    // Text subs are fetched as WebVTT and rendered client-side: no transcode.
    { Format: 'vtt', Method: 'External' },
    { Format: 'subrip', Method: 'External' },
    { Format: 'srt', Method: 'External' },
    { Format: 'ass', Method: 'External' },
    { Format: 'ssa', Method: 'External' },
    // Bitmap subs cannot be rendered by the browser; they must be burned in.
    { Format: 'pgssub', Method: 'Encode' },
    { Format: 'dvdsub', Method: 'Encode' },
    { Format: 'dvbsub', Method: 'Encode' },
  ]

  return {
    Name: 'JellyTube Web',
    MaxStreamingBitrate: maxStreamingBitrate,
    MaxStaticBitrate: maxStreamingBitrate,
    MusicStreamingTranscodingBitrate: 384_000,
    DirectPlayProfiles: directPlayProfiles,
    TranscodingProfiles: transcodingProfiles,
    SubtitleProfiles: subtitleProfiles,
    ContainerProfiles: [],
    CodecProfiles: [],
  }
}
