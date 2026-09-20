import type {
  JellyfinAuthResponse,
  JellyfinItem,
  JellyfinItemsResponse,
  JellyfinMediaSource,
  JellyfinUser,
  MediaSegment,
  MediaSegmentsResponse,
  MediaSegmentType,
  PlaybackInfoResponse,
  PlaybackSessionReport,
  RemoteSearchResult,
  TrickplayInfo,
} from '../types/jellyfin'
import { buildDeviceProfile } from './deviceProfile'

const CLIENT_NAME = 'JellyTube'
const CLIENT_VERSION = '2.0.0'
const DEVICE_NAME = 'JellyTube Web'

export function getDeviceId(): string {
  let id = localStorage.getItem('jellyflix_device_id')
  if (!id) {
    id = 'jellyflix_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
    localStorage.setItem('jellyflix_device_id', id)
  }
  return id
}

export class JellyfinApi {
  private baseUrl: string
  private token: string | null = null
  private deviceId: string

  constructor(serverUrl?: string, token?: string | null) {
    const raw = serverUrl !== undefined ? serverUrl : (import.meta.env.VITE_JELLYFIN_URL || '')
    this.baseUrl = raw.includes('localhost:8097') ? '' : raw.replace(/\/$/, '')
    this.token = token || null
    this.deviceId = getDeviceId()
  }

  public setToken(token: string | null) {
    this.token = token
  }

  public getToken(): string | null {
    return this.token
  }

  public setServerUrl(url: string) {
    const cleaned = url.trim().replace(/\/$/, '')
    this.baseUrl = cleaned.includes('localhost:8097') ? '' : cleaned
  }

  public getServerUrl(): string {
    return this.baseUrl
  }

  /**
   * Determine API base path:
   * If a custom external URL was provided (e.g. https://my-server.com), use it.
   * Otherwise, return same-origin relative proxy '/jellyfin-api'.
   */
  public getApiBase(): string {
    if (this.baseUrl && !this.baseUrl.includes('localhost:8097')) {
      return this.baseUrl
    }
    return '/jellyfin-api'
  }

  private getAuthHeader(): string {
    const parts = [
      `Client="${CLIENT_NAME}"`,
      `Device="${DEVICE_NAME}"`,
      `DeviceId="${this.deviceId}"`,
      `Version="${CLIENT_VERSION}"`,
    ]
    if (this.token) {
      parts.push(`Token="${this.token}"`)
    }
    return `MediaBrowser ${parts.join(', ')}`
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const apiBase = this.getApiBase()
    const url = `${apiBase}${path.startsWith('/') ? path : '/' + path}`
    const authHeader = this.getAuthHeader()
    const headers: Record<string, string> = {
      'Authorization': authHeader,
      'X-Emby-Authorization': authHeader,
      ...(options.headers as Record<string, string>),
    }

    if (this.token) {
      headers['X-MediaBrowser-Token'] = this.token
    }

    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText)
      throw new Error(`Jellyfin API Error (${response.status}): ${errorText}`)
    }

    if (response.status === 204) {
      return {} as T
    }

    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      return response.json()
    }
    return {} as T
  }

  // System & Public
  async getPublicInfo(): Promise<any> {
    return this.fetch('/System/Info/Public')
  }

  async getPublicUsers(): Promise<JellyfinUser[]> {
    return this.fetch<JellyfinUser[]>('/Users/Public')
  }

  async getUsers(): Promise<JellyfinUser[]> {
    return this.fetch<JellyfinUser[]>('/Users')
  }

  // Auth
  async authenticateByName(username: string, password: string): Promise<JellyfinAuthResponse> {
    const res = await this.fetch<JellyfinAuthResponse>('/Users/AuthenticateByName', {
      method: 'POST',
      body: JSON.stringify({
        Username: username,
        Pw: password,
      }),
    })
    this.token = res.AccessToken
    return res
  }

  // Update User Password
  async updatePassword(userId: string, currentPw: string, newPw: string): Promise<void> {
    await this.fetch(`/Users/Password?userId=${encodeURIComponent(userId)}`, {
      method: "POST",
      body: JSON.stringify({
        CurrentPw: currentPw,
        NewPw: newPw,
      }),
    })
  }

  // Media Library Views (Movies, Shows, etc.)
  async getUserViews(userId: string): Promise<JellyfinItemsResponse> {
    return this.fetch<JellyfinItemsResponse>(`/UserViews?userId=${encodeURIComponent(userId)}`)
  }

  // Resume Items (Continue Watching)
  async getResumeItems(userId: string, limit = 12): Promise<JellyfinItemsResponse> {
    const params = new URLSearchParams({
      userId,
      Limit: limit.toString(),
      Fields: 'Overview,PrimaryImageAspectRatio,UserData',
      MediaTypes: 'Video',
      EnableTotalRecordCount: 'true',
    })
    return this.fetch<JellyfinItemsResponse>(`/UserItems/Resume?${params.toString()}`)
  }

  // Latest Items
  async getLatestItems(
    userId: string,
    includeItemTypes: 'Movie' | 'Series' | 'Episode' = 'Movie',
    limit = 16
  ): Promise<JellyfinItem[]> {
    const params = new URLSearchParams({
      userId,
      Limit: limit.toString(),
      IncludeItemTypes: includeItemTypes,
      Fields: 'Overview,PrimaryImageAspectRatio,UserData,Genres,Taglines',
      EnableImageTypes: 'Primary,Backdrop,Banner,Thumb,Logo',
    })
    return this.fetch<JellyfinItem[]>(`/Items/Latest?${params.toString()}`)
  }

  // Query Items
  async getItems(
    userId: string,
    options: {
      includeItemTypes?: string
      sortBy?: string
      sortOrder?: 'Ascending' | 'Descending'
      genres?: string
      searchTerm?: string
      parentId?: string
      limit?: number
      startIndex?: number
      isFavorite?: boolean
    } = {}
  ): Promise<JellyfinItemsResponse> {
    const params = new URLSearchParams({
      userId,
      Recursive: 'true',
      Fields: 'Overview,PrimaryImageAspectRatio,UserData,Genres,CommunityRating,OfficialRating,RunTimeTicks,Taglines',
      EnableImageTypes: 'Primary,Backdrop,Banner,Thumb,Logo',
    })

    if (options.includeItemTypes) params.set('IncludeItemTypes', options.includeItemTypes)
    if (options.sortBy) params.set('SortBy', options.sortBy)
    if (options.sortOrder) params.set('SortOrder', options.sortOrder)
    if (options.genres) params.set('Genres', options.genres)
    if (options.searchTerm) params.set('SearchTerm', options.searchTerm)
    if (options.parentId) params.set('ParentId', options.parentId)
    if (options.limit) params.set('Limit', options.limit.toString())
    if (options.startIndex) params.set('StartIndex', options.startIndex.toString())
    if (options.isFavorite !== undefined) params.set('IsFavorite', options.isFavorite.toString())

    return this.fetch<JellyfinItemsResponse>(`/Items?${params.toString()}`)
  }

  // Item Details
  async getItem(userId: string, itemId: string): Promise<JellyfinItem> {
    const params = new URLSearchParams({
      userId,
      Fields: 'Overview,MediaSources,MediaStreams,Chapters,Path,Size,Container,Bitrate,RemoteTrailers,People,Genres,Studios,Taglines,Trickplay',
    })
    return this.fetch<JellyfinItem>(`/Items/${itemId}?${params.toString()}`)
  }

  // Seasons for Series
  async getSeasons(seriesId: string, userId: string): Promise<JellyfinItemsResponse> {
    const params = new URLSearchParams({
      UserId: userId,
      Fields: 'Overview,PrimaryImageAspectRatio,UserData',
    })
    return this.fetch<JellyfinItemsResponse>(`/Shows/${seriesId}/Seasons?${params.toString()}`)
  }

  // Episodes for Season or entire Series
  async getEpisodes(seriesId: string, seasonId?: string, userId?: string): Promise<JellyfinItemsResponse> {
    const params = new URLSearchParams({
      Fields: 'Overview,PrimaryImageAspectRatio,UserData,MediaSources,MediaStreams,Chapters,Path,Size',
    })
    if (userId) params.set('UserId', userId)
    if (seasonId) params.set('SeasonId', seasonId)
    return this.fetch<JellyfinItemsResponse>(`/Shows/${seriesId}/Episodes?${params.toString()}`)
  }

  // Next up episode for series or user
  async getNextUp(userId: string, seriesId?: string): Promise<JellyfinItemsResponse> {
    const params = new URLSearchParams({
      UserId: userId,
      Fields: 'Overview,PrimaryImageAspectRatio,UserData,MediaSources,MediaStreams,Chapters,Path,Size',
    })
    if (seriesId) params.set('SeriesId', seriesId)
    return this.fetch<JellyfinItemsResponse>(`/Shows/NextUp?${params.toString()}`)
  }

  // Find Next Episode in Series
  async getNextEpisode(
    seriesId: string,
    seasonId: string,
    currentEpisodeIndex: number,
    userId: string
  ): Promise<JellyfinItem | null> {
    try {
      const epRes = await this.getEpisodes(seriesId, seasonId, userId)
      const currentList = epRes.Items || []
      const nextInSeason = currentList.find((ep) => (ep.IndexNumber ?? 0) === currentEpisodeIndex + 1)
      if (nextInSeason) return nextInSeason

      // Check next season
      const seasonRes = await this.getSeasons(seriesId, userId)
      const seasons = seasonRes.Items || []
      const currentSeasonIdx = seasons.findIndex((s) => s.Id === seasonId)
      if (currentSeasonIdx !== -1 && currentSeasonIdx + 1 < seasons.length) {
        const nextSeason = seasons[currentSeasonIdx + 1]
        const nextSeasonEps = await this.getEpisodes(seriesId, nextSeason.Id, userId)
        return nextSeasonEps.Items?.[0] || null
      }
      return null
    } catch {
      return null
    }
  }

  // Similar Items (More Like This)
  async getSimilarItems(itemId: string, userId: string, limit = 12): Promise<JellyfinItemsResponse> {
    const params = new URLSearchParams({
      UserId: userId,
      Limit: limit.toString(),
      Fields: 'Overview,PrimaryImageAspectRatio,UserData,CommunityRating,OfficialRating',
    })
    return this.fetch<JellyfinItemsResponse>(`/Items/${itemId}/Similar?${params.toString()}`)
  }

  // Favorite toggle
  async setFavorite(userId: string, itemId: string, isFavorite: boolean): Promise<void> {
    const method = isFavorite ? 'POST' : 'DELETE'
    await this.fetch(`/UserFavoriteItems/${itemId}?userId=${encodeURIComponent(userId)}`, { method })
  }

  // Mark as Watched / Unwatched
  async markPlayed(userId: string, itemId: string, isPlayed: boolean): Promise<void> {
    const method = isPlayed ? 'POST' : 'DELETE'
    await this.fetch(`/UserPlayedItems/${itemId}?userId=${encodeURIComponent(userId)}`, { method })
  }

  // Update Metadata
  async updateItem(itemId: string, data: Partial<JellyfinItem>): Promise<void> {
    await this.fetch(`/Items/${itemId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // Delete Media
  async deleteItem(itemId: string): Promise<void> {
    await this.fetch(`/Items/${itemId}`, {
      method: 'DELETE',
    })
  }

  // Search Remote Metadata (Identify)
  async searchRemoteMetadata(
    itemId: string,
    title: string,
    year?: number,
    itemType = 'Movie'
  ): Promise<RemoteSearchResult[]> {
    const endpoint = itemType === 'Series' ? '/Items/RemoteSearch/Series' : '/Items/RemoteSearch/Movie'
    const body: any = {
      SearchInfo: {
        Name: title,
      },
      ItemId: itemId,
    }
    if (year) body.SearchInfo.Year = year

    return this.fetch<RemoteSearchResult[]>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  // Apply Remote Metadata
  async applyRemoteMetadata(itemId: string, result: RemoteSearchResult): Promise<void> {
    await this.fetch(`/Items/RemoteSearch/Apply/${itemId}?ReplaceAllImages=true`, {
      method: 'POST',
      body: JSON.stringify(result),
    })
  }

  // Get Local Trailers
  async getLocalTrailers(_userId: string, itemId: string): Promise<JellyfinItem[]> {
    try {
      return await this.fetch<JellyfinItem[]>(`/Items/${itemId}/LocalTrailers`)
    } catch {
      return []
    }
  }

  // Playback reporting
  async reportPlaybackStart(report: PlaybackSessionReport): Promise<void> {
    await this.fetch('/Sessions/Playing', {
      method: 'POST',
      body: JSON.stringify({
        ItemId: report.ItemId,
        MediaSourceId: report.MediaSourceId,
        PlaySessionId: report.PlaySessionId,
        AudioStreamIndex: report.AudioStreamIndex,
        SubtitleStreamIndex: report.SubtitleStreamIndex,
        PositionTicks: report.PositionTicks,
        CanSeek: true,
        PlayMethod: report.PlayMethod || 'DirectPlay',
      }),
    }).catch(() => {})
  }

  async reportPlaybackProgress(report: PlaybackSessionReport): Promise<void> {
    await this.fetch('/Sessions/Playing/Progress', {
      method: 'POST',
      body: JSON.stringify({
        ItemId: report.ItemId,
        MediaSourceId: report.MediaSourceId,
        PlaySessionId: report.PlaySessionId,
        AudioStreamIndex: report.AudioStreamIndex,
        SubtitleStreamIndex: report.SubtitleStreamIndex,
        PositionTicks: report.PositionTicks,
        IsPaused: report.IsPaused,
        PlayMethod: report.PlayMethod,
        EventName: report.EventName || 'TimeUpdate',
      }),
    }).catch(() => {})
  }

  async reportPlaybackStopped(report: PlaybackSessionReport): Promise<void> {
    await this.fetch('/Sessions/Playing/Stopped', {
      method: 'POST',
      body: JSON.stringify({
        ItemId: report.ItemId,
        MediaSourceId: report.MediaSourceId,
        PlaySessionId: report.PlaySessionId,
        PositionTicks: report.PositionTicks,
      }),
    }).catch(() => {})
  }

  // Image URLs
  getImageUrl(
    itemId: string,
    imageType: 'Primary' | 'Backdrop' | 'Logo' | 'Thumb' | 'Banner' = 'Primary',
    options: {
      tag?: string
      fillWidth?: number
      fillHeight?: number
      maxWidth?: number
      maxHeight?: number
      quality?: number
      index?: number
    } = {}
  ): string {
    const apiBase = this.getApiBase()
    const endpoint =
      imageType === 'Backdrop'
        ? `/Items/${itemId}/Images/Backdrop/${options.index || 0}`
        : `/Items/${itemId}/Images/${imageType}`

    const params = new URLSearchParams()
    if (options.tag) params.set('tag', options.tag)
    if (options.fillWidth) params.set('fillWidth', options.fillWidth.toString())
    if (options.fillHeight) params.set('fillHeight', options.fillHeight.toString())
    if (options.maxWidth) params.set('maxWidth', options.maxWidth.toString())
    if (options.maxHeight) params.set('maxHeight', options.maxHeight.toString())
    if (options.quality) params.set('quality', options.quality.toString())

    const query = params.toString()
    return `${apiBase}${endpoint}${query ? '?' + query : ''}`
  }

  getUserImageUrl(userId: string, tag?: string): string {
    const apiBase = this.getApiBase()
    const params = new URLSearchParams({ userId, fillWidth: '120', fillHeight: '120' })
    if (tag) {
      params.set('tag', tag)
      params.set('quality', '90')
    }
    return `${apiBase}/UserImage?${params.toString()}`
  }

  // Item Download URL (Raw original file from Jellyfin)
  getItemDownloadUrl(itemId: string): string {
    const apiBase = this.getApiBase()
    const params = new URLSearchParams()
    if (this.token) params.set('api_key', this.token)
    return `${apiBase}/Items/${itemId}/Download?${params.toString()}`
  }

  // Direct Play Stream URL
  getDirectStreamUrl(itemId: string, mediaSourceId?: string): string {
    const apiBase = this.getApiBase()
    const params = new URLSearchParams({
      static: 'true',
      DeviceId: this.deviceId,
    })
    if (mediaSourceId) params.set('MediaSourceId', mediaSourceId)
    if (this.token) params.set('api_key', this.token)
    return `${apiBase}/Videos/${itemId}/stream?${params.toString()}`
  }

  /**
   * Negotiate playback with the server.
   *
   * Jellyfin 12 removed the client-constructed `/Videos/{id}/master.m3u8` route. The server
   * now inspects our DeviceProfile and returns the exact URL to use, so the client no longer
   * guesses at container/codec compatibility.
   */
  async getPlaybackInfo(
    itemId: string,
    userId: string,
    options: {
      mediaSourceId?: string
      audioStreamIndex?: number
      subtitleStreamIndex?: number
      startTimeTicks?: number
      maxStreamingBitrate?: number
    } = {}
  ): Promise<PlaybackInfoResponse> {
    const body: Record<string, unknown> = {
      UserId: userId,
      DeviceProfile: buildDeviceProfile(options.maxStreamingBitrate),
      EnableDirectPlay: true,
      EnableDirectStream: true,
      EnableTranscoding: true,
      AllowVideoStreamCopy: true,
      AllowAudioStreamCopy: true,
      AutoOpenLiveStream: true,
    }
    if (options.mediaSourceId) body.MediaSourceId = options.mediaSourceId
    if (options.audioStreamIndex !== undefined) body.AudioStreamIndex = options.audioStreamIndex
    if (options.subtitleStreamIndex !== undefined) body.SubtitleStreamIndex = options.subtitleStreamIndex
    if (options.startTimeTicks) body.StartTimeTicks = options.startTimeTicks
    if (options.maxStreamingBitrate) body.MaxStreamingBitrate = options.maxStreamingBitrate

    return this.fetch<PlaybackInfoResponse>(`/Items/${itemId}/PlaybackInfo`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  /** Resolve a negotiated MediaSource into an absolute, authenticated playback URL. */
  resolvePlaybackUrl(
    itemId: string,
    source: JellyfinMediaSource,
    playSessionId?: string
  ): { url: string; isHls: boolean; playMethod: 'DirectPlay' | 'DirectStream' | 'Transcode' } {
    const apiBase = this.getApiBase()

    if (source.TranscodingUrl) {
      const url = source.TranscodingUrl.startsWith('http')
        ? source.TranscodingUrl
        : `${apiBase}${source.TranscodingUrl}`
      return {
        url,
        isHls: source.TranscodingSubProtocol === 'hls' || url.includes('.m3u8'),
        playMethod: 'Transcode',
      }
    }

    const params = new URLSearchParams({ static: 'true', DeviceId: this.deviceId })
    if (source.Id) params.set('MediaSourceId', source.Id)
    if (playSessionId) params.set('PlaySessionId', playSessionId)
    if (this.token) params.set('api_key', this.token)

    return {
      url: `${apiBase}/Videos/${itemId}/stream?${params.toString()}`,
      isHls: false,
      playMethod: source.SupportsDirectPlay ? 'DirectPlay' : 'DirectStream',
    }
  }

  /**
   * Native media segments (Intro / Outro / Recap / Preview / Commercial).
   * Replaces the old heuristic of string-matching a chapter named "intro".
   */
  async getMediaSegments(
    itemId: string,
    includeSegmentTypes?: MediaSegmentType[]
  ): Promise<MediaSegment[]> {
    const params = new URLSearchParams()
    for (const t of includeSegmentTypes || []) params.append('includeSegmentTypes', t)
    const query = params.toString()
    try {
      const res = await this.fetch<MediaSegmentsResponse>(
        `/MediaSegments/${itemId}${query ? '?' + query : ''}`
      )
      return res.Items || []
    } catch {
      return []
    }
  }

  /** Pick the best available trickplay tile resolution for the given target width. */
  selectTrickplayResolution(
    trickplay: Record<string, Record<string, TrickplayInfo>> | undefined,
    mediaSourceId: string,
    preferredWidth = 320
  ): TrickplayInfo | null {
    const forSource = trickplay?.[mediaSourceId]
    if (!forSource) return null
    const widths = Object.keys(forSource)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b)
    if (widths.length === 0) return null
    const chosen = widths.find((w) => w >= preferredWidth) ?? widths[widths.length - 1]
    return forSource[String(chosen)] ?? null
  }

  /** URL of a trickplay tile sheet (a grid of scrub-preview thumbnails). */
  getTrickplayTileUrl(itemId: string, width: number, tileIndex: number, mediaSourceId?: string): string {
    const apiBase = this.getApiBase()
    const params = new URLSearchParams()
    if (mediaSourceId) params.set('mediaSourceId', mediaSourceId)
    if (this.token) params.set('api_key', this.token)
    const query = params.toString()
    return `${apiBase}/Videos/${itemId}/Trickplay/${width}/${tileIndex}.jpg${query ? '?' + query : ''}`
  }

  getSubtitleUrl(itemId: string, mediaSourceId: string, index: number): string {
    const apiBase = this.getApiBase()
    const params = new URLSearchParams()
    if (this.token) params.set('api_key', this.token)
    return `${apiBase}/Videos/${itemId}/${mediaSourceId}/Subtitles/${index}/Stream.vtt?${params.toString()}`
  }

  // Fetch Subtitle WebVTT Content directly
  async fetchSubtitleVtt(itemId: string, mediaSourceId: string, index: number): Promise<string> {
    const url = this.getSubtitleUrl(itemId, mediaSourceId, index)
    const response = await fetch(url, {
      headers: {
        Authorization: this.getAuthHeader(),
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to load subtitle: HTTP ${response.status}`)
    }
    return await response.text()
  }
}

export const jellyfinApi = new JellyfinApi()
