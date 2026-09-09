import type {
  JellyfinAuthResponse,
  JellyfinItem,
  JellyfinItemsResponse,
  JellyfinUser,
  PlaybackSessionReport,
  RemoteSearchResult,
} from '../types/jellyfin'

const CLIENT_NAME = 'JellyFlix'
const CLIENT_VERSION = '1.0.0'
const DEVICE_NAME = 'JellyFlix Web'

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
    this.baseUrl = serverUrl || import.meta.env.VITE_JELLYFIN_URL || ''
    this.token = token || null
    this.deviceId = getDeviceId()
  }

  public setToken(token: string | null) {
    this.token = token
  }

  public setServerUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '')
  }

  public getServerUrl(): string {
    return this.baseUrl
  }

  /**
   * Determine API base path:
   * If in browser and URL matches current origin or relative, use Vite proxy /jellyfin-api
   */
  public getApiBase(): string {
    // If running in development and baseUrl matches standard localhost:8097, use proxy to bypass CORS
    if (import.meta.env.DEV) {
      return '/jellyfin-api'
    }
    return this.baseUrl || '/jellyfin-api'
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

  // Media Library Views (Movies, Shows, etc.)
  async getUserViews(userId: string): Promise<JellyfinItemsResponse> {
    return this.fetch<JellyfinItemsResponse>(`/Users/${userId}/Views`)
  }

  // Resume Items (Continue Watching)
  async getResumeItems(userId: string, limit = 12): Promise<JellyfinItemsResponse> {
    const params = new URLSearchParams({
      Limit: limit.toString(),
      Recursive: 'true',
      Fields: 'Overview,PrimaryImageAspectRatio,UserData,SeriesInfo',
      MediaTypes: 'Video',
      EnableTotalRecordCount: 'true',
    })
    return this.fetch<JellyfinItemsResponse>(`/Users/${userId}/Items/Resume?${params.toString()}`)
  }

  // Latest Items
  async getLatestItems(
    userId: string,
    includeItemTypes: 'Movie' | 'Series' | 'Episode' = 'Movie',
    limit = 16
  ): Promise<JellyfinItem[]> {
    const params = new URLSearchParams({
      Limit: limit.toString(),
      IncludeItemTypes: includeItemTypes,
      Fields: 'Overview,PrimaryImageAspectRatio,UserData,Genres,Taglines',
      EnableImageTypes: 'Primary,Backdrop,Banner,Thumb,Logo',
    })
    return this.fetch<JellyfinItem[]>(`/Users/${userId}/Items/Latest?${params.toString()}`)
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

    return this.fetch<JellyfinItemsResponse>(`/Users/${userId}/Items?${params.toString()}`)
  }

  // Item Details
  async getItem(userId: string, itemId: string): Promise<JellyfinItem> {
    const params = new URLSearchParams({
      Fields: 'Overview,MediaSources,MediaStreams,Chapters,Path,Size,Container,Bitrate,RemoteTrailers,People,Genres,Studios,Taglines',
    })
    return this.fetch<JellyfinItem>(`/Users/${userId}/Items/${itemId}?${params.toString()}`)
  }

  // Seasons for Series
  async getSeasons(seriesId: string, userId: string): Promise<JellyfinItemsResponse> {
    const params = new URLSearchParams({
      UserId: userId,
      Fields: 'Overview,PrimaryImageAspectRatio,UserData',
    })
    return this.fetch<JellyfinItemsResponse>(`/Shows/${seriesId}/Seasons?${params.toString()}`)
  }

  // Episodes for Season
  async getEpisodes(seriesId: string, seasonId: string, userId: string): Promise<JellyfinItemsResponse> {
    const params = new URLSearchParams({
      UserId: userId,
      SeasonId: seasonId,
      Fields: 'Overview,PrimaryImageAspectRatio,UserData,MediaSources,MediaStreams,Chapters,Path,Size',
    })
    return this.fetch<JellyfinItemsResponse>(`/Shows/${seriesId}/Episodes?${params.toString()}`)
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
    await this.fetch(`/Users/${userId}/FavoriteItems/${itemId}`, { method })
  }

  // Mark as Watched / Unwatched
  async markPlayed(userId: string, itemId: string, isPlayed: boolean): Promise<void> {
    const method = isPlayed ? 'POST' : 'DELETE'
    await this.fetch(`/Users/${userId}/PlayedItems/${itemId}`, { method })
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
  async getLocalTrailers(userId: string, itemId: string): Promise<JellyfinItem[]> {
    try {
      return await this.fetch<JellyfinItem[]>(`/Users/${userId}/Items/${itemId}/LocalTrailers`)
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
        PositionTicks: report.PositionTicks,
        IsPaused: report.IsPaused,
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
    const query = tag ? `?tag=${tag}&fillWidth=120&fillHeight=120&quality=90` : '?fillWidth=120&fillHeight=120'
    return `${apiBase}/Users/${userId}/Images/Primary${query}`
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

  // HLS Universal Transcoding Master Stream URL
  getHlsStreamUrl(
    itemId: string,
    options: {
      mediaSourceId?: string
      audioStreamIndex?: number
      subtitleStreamIndex?: number
      startTimeTicks?: number
    } = {}
  ): string {
    const apiBase = this.getApiBase()
    const params = new URLSearchParams({
      DeviceId: this.deviceId,
      MediaSourceId: options.mediaSourceId || itemId,
      VideoCodec: 'h264',
      AudioCodec: 'aac,mp3',
      TranscodingMaxAudioChannels: '2',
      SegmentContainer: 'ts',
      MinSegments: '2',
      BreakOnNonKeyFrames: 'true',
      ManifestSubtitles: 'vtt',
    })
    if (options.audioStreamIndex !== undefined) {
      params.set('AudioStreamIndex', options.audioStreamIndex.toString())
    }
    if (options.subtitleStreamIndex !== undefined) {
      params.set('SubtitleStreamIndex', options.subtitleStreamIndex.toString())
    }
    if (options.startTimeTicks) {
      params.set('StartTimeTicks', options.startTimeTicks.toString())
    }
    if (this.token) {
      params.set('api_key', this.token)
    }
    return `${apiBase}/Videos/${itemId}/master.m3u8?${params.toString()}`
  }

  // Subtitle WebVTT Stream URL
  getSubtitleUrl(itemId: string, mediaSourceId: string, index: number): string {
    const apiBase = this.getApiBase()
    const params = new URLSearchParams()
    if (this.token) params.set('api_key', this.token)
    return `${apiBase}/Videos/${itemId}/${mediaSourceId}/Subtitles/${index}/Stream.vtt?${params.toString()}`
  }
}

export const jellyfinApi = new JellyfinApi()
