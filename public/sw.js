const CACHE_NAME = 'jellyflix-cache-v2'
const OFFLINE_MEDIA_CACHE = 'jellyflix-downloads-v1'

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.png',
  '/icons.svg',
  '/icons/pwa-64x64.png',
  '/icons/pwa-144x144.png',
  '/icons/pwa-192x192.png',
  '/icons/pwa-512x512.png',
  '/icons/maskable-icon-512x512.png',
  '/icons/apple-touch-icon-180x180.png',
]

// Install: precache the core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  )
})

// Activate: clean up old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME && key !== OFFLINE_MEDIA_CACHE) {
              return caches.delete(key)
            }
          })
        )
      )
      .then(() => self.clients.claim())
  )
})

// Helper: Check if request is media streaming or byte-range request
function isMediaOrStreamRequest(request) {
  const url = request.url
  if (request.headers.has('range')) return true

  // Jellyfin streaming endpoints & video chunks
  return (
    url.includes('/Videos/') ||
    url.includes('/Audio/') ||
    url.includes('/hls/') ||
    url.includes('/stream') ||
    url.includes('/PlaybackInfo') ||
    url.includes('/LiveStreams') ||
    url.includes('/Download') ||
    url.endsWith('.m3u8') ||
    url.endsWith('.ts') ||
    url.endsWith('.mp4') ||
    url.endsWith('.mkv') ||
    url.endsWith('.webm')
  )
}


// Handler for offline video streams with HTTP 206 Partial Content (Byte Range) support
async function handleOfflineVideo(request) {
  try {
    const cache = await caches.open(OFFLINE_MEDIA_CACHE)
    const url = new URL(request.url)
    const cachedResponse = (await cache.match(url.pathname)) || (await cache.match(request))

    if (!cachedResponse) {
      return new Response('Offline video not found in storage', {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    const rangeHeader = request.headers.get('range')
    const contentType = cachedResponse.headers.get('content-type') || 'video/mp4'

    // If no range requested, return full stream with Accept-Ranges header
    if (!rangeHeader) {
      const headers = new Headers(cachedResponse.headers)
      headers.set('Accept-Ranges', 'bytes')
      return new Response(cachedResponse.body, {
        status: 200,
        headers,
      })
    }

    // Handle range slicing for HTML5 video seeking & scrubbing
    const blob = await cachedResponse.blob()
    const total = blob.size

    const matches = rangeHeader.match(/bytes=(\d+)-(\d+)?/)
    if (!matches) {
      return new Response('Invalid Range', {
        status: 416,
        statusText: 'Range Not Satisfiable',
        headers: { 'Content-Range': `bytes */${total}` },
      })
    }

    const start = parseInt(matches[1], 10)
    // Send in chunks (default 2MB) for responsive seeking
    const end = matches[2] ? parseInt(matches[2], 10) : Math.min(start + 2 * 1024 * 1024 - 1, total - 1)

    if (start >= total || start > end) {
      return new Response('Range Out of Bounds', {
        status: 416,
        statusText: 'Range Not Satisfiable',
        headers: { 'Content-Range': `bytes */${total}` },
      })
    }

    const slicedBlob = blob.slice(start, end + 1)
    const chunkSize = end - start + 1

    return new Response(slicedBlob, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize.toString(),
        'Content-Type': contentType,
      },
    })
  } catch (err) {
    return new Response('Error loading offline video: ' + err.message, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}

async function handleOfflinePoster(request) {
  try {
    const cache = await caches.open(OFFLINE_MEDIA_CACHE)
    const url = new URL(request.url)
    const match = (await cache.match(url.pathname)) || (await cache.match(request))
    if (match) return match
    return new Response('', { status: 404 })
  } catch (err) {
    return new Response('', { status: 404 })
  }
}
// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only handle GET requests
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  // 0a. Handle offline video range requests (HTTP 206)
  if (url.pathname.startsWith('/offline-video/')) {
    event.respondWith(handleOfflineVideo(request))
    return
  }

  // 0b. Handle offline cached poster images
  if (url.pathname.startsWith('/offline-poster/')) {
    event.respondWith(handleOfflinePoster(request))
    return
  }

  // Bypass live Jellyfin media streaming and video byte-range requests directly to network
  if (isMediaOrStreamRequest(request)) {
    return
  }

  // 1. Navigation requests (HTML documents) -> Network-first with offline fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request)
          if (cached) return cached
          const indexFallback = await caches.match('/index.html')
          if (indexFallback) return indexFallback
          return new Response('Offline - JellyFlix', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/html' },
          })
        })
    )
    return
  }

  // 2. Jellyfin API requests (/jellyfin-api/) -> Network-first (never freeze dynamic library states)
  if (url.pathname.startsWith('/jellyfin-api/')) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        return new Response(JSON.stringify({ error: 'offline', message: 'You are currently offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      })
    )
    return
  }

  // 3. Static assets: JS, CSS, Google Fonts, SVGs, PNGs -> Stale-While-Revalidate
  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.webmanifest')

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
            }
            return networkResponse
          })
          .catch(() => cachedResponse)

        return cachedResponse || fetchPromise
      })
    )
  }
})
