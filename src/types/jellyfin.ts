export interface JellyfinUser {
  Id: string
  Name: string
  ServerId?: string
  HasPassword?: boolean
  HasConfiguredPassword?: boolean
  PrimaryImageTag?: string
  Policy?: {
    IsAdministrator?: boolean
    EnableContentDeletion?: boolean
  }
}

export interface JellyfinAuthResponse {
  User: JellyfinUser
  AccessToken: string
  ServerId: string
}

export interface JellyfinMediaStream {
  Codec?: string
  Language?: string
  DisplayTitle?: string
  Type: 'Video' | 'Audio' | 'Subtitle'
  IsDefault?: boolean
  IsForced?: boolean
  Index: number
  Height?: number
  Width?: number
  AspectRatio?: string
  BitRate?: number
  Channels?: number
  SampleRate?: number
  BitDepth?: number
  Profile?: string
  Level?: number
  DeliveryMethod?: string
  DeliveryUrl?: string
  IsTextSubtitleStream?: boolean
  SupportsExternalStream?: boolean
}

export interface JellyfinMediaSource {
  Id: string
  Path?: string
  Protocol?: string
  Container?: string
  Size?: number
  Bitrate?: number
  SupportsDirectPlay?: boolean
  SupportsDirectStream?: boolean
  SupportsTranscoding?: boolean
  MediaStreams?: JellyfinMediaStream[]
}

export interface JellyfinUserData {
  PlaybackPositionTicks?: number
  PlayCount?: number
  IsFavorite?: boolean
  Played?: boolean
  Key?: string
  PlayedPercentage?: number
  LastPlayedDate?: string
}

export interface JellyfinChapter {
  StartPositionTicks: number
  Name: string
  ImagePath?: string
  ImageTag?: string
}

export interface JellyfinItem {
  Id: string
  Name: string
  OriginalTitle?: string
  Overview?: string
  Type: 'Movie' | 'Series' | 'Episode' | 'Season' | 'CollectionFolder' | 'BoxSet' | 'Folder' | string
  ProductionYear?: number
  PremiereDate?: string
  EndDate?: string
  OfficialRating?: string
  CommunityRating?: number
  CriticRating?: number
  RunTimeTicks?: number
  Path?: string
  Container?: string
  Size?: number
  Bitrate?: number
  Genres?: string[]
  Studios?: { Id: string; Name: string }[]
  Taglines?: string[]
  ImageTags?: {
    Primary?: string
    Logo?: string
    Backdrop?: string
    Thumb?: string
    Banner?: string
    Art?: string
  }
  BackdropImageTags?: string[]
  UserData?: JellyfinUserData
  SeriesName?: string
  SeriesId?: string
  SeasonName?: string
  SeasonId?: string
  IndexNumber?: number
  ParentIndexNumber?: number
  MediaSources?: JellyfinMediaSource[]
  MediaStreams?: JellyfinMediaStream[]
  Chapters?: JellyfinChapter[]
  People?: {
    Id: string
    Name: string
    Role?: string
    Type: string
    PrimaryImageTag?: string
  }[]
  ChildCount?: number
  RemoteTrailers?: { Url: string; Name?: string }[]
}

export interface JellyfinItemsResponse {
  Items: JellyfinItem[]
  TotalRecordCount: number
  StartIndex?: number
}

export interface PlaybackSessionReport {
  ItemId: string
  MediaSourceId?: string
  AudioStreamIndex?: number
  SubtitleStreamIndex?: number
  PositionTicks: number
  IsPaused?: boolean
  PlayMethod?: 'DirectPlay' | 'DirectStream' | 'Transcode'
  EventName?: string
}

export interface RemoteSearchResult {
  Name: string
  ProductionYear?: number
  IndexNumber?: number
  SearchProviderName?: string
  Overview?: string
  ImageUrl?: string
  ProviderIds?: Record<string, string>
}
