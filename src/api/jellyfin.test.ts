import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { JellyfinApi } from '../api/jellyfin'
import { server } from '../test/msw'
import apiSurface from '../test/jellyfin-api-surface.json'

const BASE = 'http://jellyfin.test'

/** Records the request line of every call the client makes during a test. */
function recordRequests() {
  const seen: { method: string; path: string; search: URLSearchParams }[] = []
  server.use(
    http.all(`${BASE}/*`, ({ request }) => {
      const url = new URL(request.url)
      seen.push({
        method: request.method,
        path: url.pathname,
        search: url.searchParams,
      })
      return HttpResponse.json({ Items: [], TotalRecordCount: 0 })
    })
  )
  return seen
}

/**
 * Turns a concrete request path into its OpenAPI template form so it can be
 * looked up in the captured server surface (e.g. /Items/abc -> /Items/{itemId}).
 */
function matchesSpecPath(actual: string): string | null {
  const specPaths = Object.keys(apiSurface.paths)
  if (specPaths.includes(actual)) return actual

  const actualParts = actual.split('/').filter(Boolean)
  for (const spec of specPaths) {
    const specParts = spec.split('/').filter(Boolean)
    if (specParts.length !== actualParts.length) continue
    const ok = specParts.every(
      (part, i) => (part.startsWith('{') && part.endsWith('}')) || part === actualParts[i]
    )
    if (ok) return spec
  }
  return null
}

describe('JellyfinApi contract against Jellyfin 12', () => {
  let api: JellyfinApi

  beforeEach(() => {
    api = new JellyfinApi(BASE, 'test-token')
  })

  it('pins the server version this client targets', () => {
    expect(apiSurface.serverVersion).toBe('12.0.0')
  })

  describe('every request hits a path that exists on the server', () => {
    const cases: [string, () => Promise<unknown>][] = [
      ['getUserViews', () => api.getUserViews('user-1')],
      ['getResumeItems', () => api.getResumeItems('user-1')],
      ['getLatestItems', () => api.getLatestItems('user-1', 'Movie')],
      ['getItems', () => api.getItems('user-1', { includeItemTypes: 'Movie' })],
      ['getItem', () => api.getItem('user-1', 'item-1')],
      ['getSeasons', () => api.getSeasons('series-1', 'user-1')],
      ['getEpisodes', () => api.getEpisodes('series-1', 'season-1', 'user-1')],
      ['getNextUp', () => api.getNextUp('user-1')],
      ['getSimilarItems', () => api.getSimilarItems('item-1', 'user-1')],
      ['setFavorite', () => api.setFavorite('user-1', 'item-1', true)],
      ['markPlayed', () => api.markPlayed('user-1', 'item-1', true)],
      ['getLocalTrailers', () => api.getLocalTrailers('user-1', 'item-1')],
      ['getMediaSegments', () => api.getMediaSegments('item-1')],
      ['getPublicUsers', () => api.getPublicUsers()],
      ['getPublicInfo', () => api.getPublicInfo()],
    ]

    it.each(cases)('%s', async (_name, call) => {
      const seen = recordRequests()
      await call()
      expect(seen).toHaveLength(1)

      const specPath = matchesSpecPath(seen[0].path)
      expect(specPath, `${seen[0].path} is not a route on Jellyfin 12`).not.toBeNull()

      const allowedMethods = apiSurface.paths[specPath as keyof typeof apiSurface.paths]
      expect(allowedMethods).toContain(seen[0].method)
    })
  })

  it('never calls the removed /Users/{userId}/Items namespace', async () => {
    const seen = recordRequests()
    await Promise.all([
      api.getUserViews('user-1'),
      api.getResumeItems('user-1'),
      api.getLatestItems('user-1'),
      api.getItems('user-1'),
      api.getItem('user-1', 'item-1'),
      api.setFavorite('user-1', 'item-1', true),
      api.markPlayed('user-1', 'item-1', false),
      api.getLocalTrailers('user-1', 'item-1'),
    ])

    const legacy = seen.filter((r) => /^\/Users\/[^/]+\/(Items|Views|FavoriteItems|PlayedItems|Images)/.test(r.path))
    expect(legacy.map((r) => r.path)).toEqual([])
  })

  it('passes userId as a query parameter, not a path segment', async () => {
    const seen = recordRequests()
    await api.getItems('user-42', { includeItemTypes: 'Movie' })
    expect(seen[0].path).toBe('/Items')
    expect(seen[0].search.get('userId')).toBe('user-42')
  })

  it('uses DELETE to clear a favorite and POST to set it', async () => {
    const seen = recordRequests()
    await api.setFavorite('user-1', 'item-1', true)
    await api.setFavorite('user-1', 'item-1', false)
    expect(seen.map((r) => r.method)).toEqual(['POST', 'DELETE'])
    expect(seen[0].path).toBe('/UserFavoriteItems/item-1')
  })

  it('builds user avatar URLs from the /UserImage route', () => {
    const url = api.getUserImageUrl('user-1', 'tag-abc')
    expect(url).toContain('/UserImage?')
    expect(url).toContain('userId=user-1')
    expect(url).toContain('tag=tag-abc')
    expect(url).not.toContain('/Users/user-1/Images')
  })
})

describe('playback negotiation', () => {
  let api: JellyfinApi

  beforeEach(() => {
    api = new JellyfinApi(BASE, 'test-token')
  })

  it('POSTs a device profile to PlaybackInfo', async () => {
    let body: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/Items/:itemId/PlaybackInfo`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ MediaSources: [], PlaySessionId: 'sess-1' })
      })
    )

    await api.getPlaybackInfo('item-1', 'user-1', { audioStreamIndex: 2 })

    expect(body.UserId).toBe('user-1')
    expect(body.AudioStreamIndex).toBe(2)
    expect(body.DeviceProfile).toBeDefined()
    const profile = body.DeviceProfile as { DirectPlayProfiles: unknown[]; TranscodingProfiles: unknown[] }
    expect(profile.DirectPlayProfiles.length).toBeGreaterThan(0)
    expect(profile.TranscodingProfiles.length).toBeGreaterThan(0)
  })

  it('prefers the server-supplied transcoding URL when present', () => {
    const resolved = api.resolvePlaybackUrl(
      'item-1',
      {
        Id: 'src-1',
        TranscodingUrl: '/Videos/item-1/main.m3u8?PlaySessionId=sess-1',
        TranscodingSubProtocol: 'hls',
      },
      'sess-1'
    )
    expect(resolved.isHls).toBe(true)
    expect(resolved.playMethod).toBe('Transcode')
    expect(resolved.url).toBe(`${BASE}/Videos/item-1/main.m3u8?PlaySessionId=sess-1`)
  })

  it('falls back to a direct stream URL when no transcode is offered', () => {
    const resolved = api.resolvePlaybackUrl(
      'item-1',
      { Id: 'src-1', SupportsDirectPlay: true },
      'sess-1'
    )
    expect(resolved.isHls).toBe(false)
    expect(resolved.playMethod).toBe('DirectPlay')
    expect(resolved.url).toContain('/Videos/item-1/stream')
    expect(resolved.url).toContain('PlaySessionId=sess-1')
  })

  it('never constructs the removed master.m3u8 route', () => {
    const resolved = api.resolvePlaybackUrl('item-1', { Id: 'src-1', SupportsDirectStream: true })
    expect(resolved.url).not.toContain('master.m3u8')
  })
})

describe('media segments', () => {
  it('returns typed segments and tolerates servers without a provider', async () => {
    const api = new JellyfinApi(BASE, 'test-token')

    server.use(
      http.get(`${BASE}/MediaSegments/:itemId`, () =>
        HttpResponse.json({
          Items: [{ Id: 's1', ItemId: 'item-1', Type: 'Intro', StartTicks: 0, EndTicks: 900_000_000 }],
          TotalRecordCount: 1,
        })
      )
    )
    const segments = await api.getMediaSegments('item-1', ['Intro'])
    expect(segments).toHaveLength(1)
    expect(segments[0].Type).toBe('Intro')

    server.use(http.get(`${BASE}/MediaSegments/:itemId`, () => new HttpResponse(null, { status: 404 })))
    await expect(api.getMediaSegments('item-1')).resolves.toEqual([])
  })
})

describe('trickplay', () => {
  const api = new JellyfinApi(BASE, 'test-token')

  it('selects the smallest tile width at or above the requested size', () => {
    const trickplay = {
      'src-1': {
        '160': { Width: 160, Height: 90, TileWidth: 10, TileHeight: 10, ThumbnailCount: 100, Interval: 10000, Bandwidth: 1 },
        '320': { Width: 320, Height: 180, TileWidth: 10, TileHeight: 10, ThumbnailCount: 100, Interval: 10000, Bandwidth: 2 },
        '640': { Width: 640, Height: 360, TileWidth: 10, TileHeight: 10, ThumbnailCount: 100, Interval: 10000, Bandwidth: 3 },
      },
    }
    expect(api.selectTrickplayResolution(trickplay, 'src-1', 320)?.Width).toBe(320)
    expect(api.selectTrickplayResolution(trickplay, 'src-1', 200)?.Width).toBe(320)
    expect(api.selectTrickplayResolution(trickplay, 'src-1', 5000)?.Width).toBe(640)
  })

  it('returns null when the source has no trickplay data', () => {
    expect(api.selectTrickplayResolution(undefined, 'src-1')).toBeNull()
    expect(api.selectTrickplayResolution({}, 'src-1')).toBeNull()
  })
})
