const CACHE_NAME = 'jellyflix-cache-v1'

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
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
            if (key !== CACHE_NAME) {
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

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only handle GET requests
  if (request.method !== 'GET') {
    return
  }

  // Bypass media streaming and video byte-range requests directly to network
  if (isMediaOrStreamRequest(request)) {
    return
  }

  const url = new URL(request.url)

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
