import { jellyfinApi } from '../api/jellyfin'
import type { JellyfinItem } from '../types/jellyfin'

export const OFFLINE_MEDIA_CACHE = 'jellyflix-downloads-v1'
const DB_NAME = 'jellyflix_offline_db'
const DB_VERSION = 1
const STORE_NAME = 'downloads'

export interface DownloadedItem {
  id: string
  name: string
  type: 'Movie' | 'Episode'
  seriesName?: string
  seasonName?: string
  seriesId?: string
  seasonId?: string
  indexNumber?: number
  productionYear?: number
  overview?: string
  runTimeTicks?: number
  fileSize: number
  downloadDate: number
  contentType: string
  posterUrl: string
  item: JellyfinItem
}

export interface ActiveDownload {
  itemId: string
  name: string
  type: 'Movie' | 'Episode'
  progress: number // 0 to 100
  loadedBytes: number
  totalBytes: number
  speed: number // bytes/sec
  status: 'downloading' | 'completed' | 'failed' | 'canceled'
  error?: string
}

type DownloadListener = (downloads: DownloadedItem[], active: ActiveDownload[]) => void

class DownloadManager {
  private dbPromise: Promise<IDBDatabase> | null = null
  private activeDownloads = new Map<string, {
    info: ActiveDownload
    abortController: AbortController
  }>()
  private listeners: Set<DownloadListener> = new Set()

  constructor() {
    this.initDb()
  }

  private initDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB not supported'))
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('type', 'type', { unique: false })
          store.createIndex('downloadDate', 'downloadDate', { unique: false })
          store.createIndex('seriesId', 'seriesId', { unique: false })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    return this.dbPromise
  }

  public subscribe(listener: DownloadListener): () => void {
    this.listeners.add(listener)
    // Initial emit
    this.getAllDownloads().then((items) => {
      listener(items, this.getActiveDownloadsList())
    })
    return () => this.listeners.delete(listener)
  }

  private async notifyListeners() {
    const items = await this.getAllDownloads()
    const active = this.getActiveDownloadsList()
    this.listeners.forEach((l) => l(items, active))
  }

  public getActiveDownloadsList(): ActiveDownload[] {
    return Array.from(this.activeDownloads.values()).map((v) => ({ ...v.info }))
  }

  public async requestStoragePersistence(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        return await navigator.storage.persist()
      } catch {
        return false
      }
    }
    return false
  }

  public async getStorageEstimate(): Promise<{ used: number; quota: number }> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate()
        return { used: usage, quota }
      } catch {
        return { used: 0, quota: 0 }
      }
    }
    return { used: 0, quota: 0 }
  }

  public async getAllDownloads(): Promise<DownloadedItem[]> {
    try {
      const db = await this.initDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const req = store.getAll()
        req.onsuccess = () => resolve(req.result || [])
        req.onerror = () => reject(req.error)
      })
    } catch {
      return []
    }
  }

  public async isItemDownloaded(itemId: string): Promise<boolean> {
    try {
      const db = await this.initDb()
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const req = store.get(itemId)
        req.onsuccess = () => resolve(!!req.result)
        req.onerror = () => resolve(false)
      })
    } catch {
      return false
    }
  }

  public isItemDownloading(itemId: string): boolean {
    const item = this.activeDownloads.get(itemId)
    return !!item && item.info.status === 'downloading'
  }

  public getDownloadProgress(itemId: string): number | null {
    const item = this.activeDownloads.get(itemId)
    return item ? item.info.progress : null
  }

  // Start Downloading Video + Poster + Metadata
  public async startDownload(item: JellyfinItem): Promise<void> {
    const itemId = item.Id
    if (await this.isItemDownloaded(itemId)) return
    if (this.isItemDownloading(itemId)) return

    // Request persistent storage so browser does not evict downloaded content
    await this.requestStoragePersistence()

    const abortController = new AbortController()
    const activeInfo: ActiveDownload = {
      itemId,
      name: item.Name,
      type: item.Type === 'Episode' ? 'Episode' : 'Movie',
      progress: 0,
      loadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      status: 'downloading',
    }

    this.activeDownloads.set(itemId, { info: activeInfo, abortController })
    this.notifyListeners()

    try {
      const cache = await caches.open(OFFLINE_MEDIA_CACHE)

      // 1. Download Poster in background and cache it
      try {
        const posterUrl = jellyfinApi.getImageUrl(item.Id, 'Primary', { maxWidth: 600, quality: 90 })
        const posterRes = await fetch(posterUrl, { signal: abortController.signal })
        if (posterRes.ok) {
          await cache.put(`/offline-poster/${itemId}`, posterRes)
        }
      } catch (e) {
        console.warn('Could not cache offline poster:', e)
      }

      // 2. Fetch original media stream from Jellyfin
      // Use direct stream or download endpoint
      const downloadUrl = jellyfinApi.getItemDownloadUrl(itemId)
      const res = await fetch(downloadUrl, {
        signal: abortController.signal,
      })

      if (!res.ok) {
        // Fallback to static direct stream
        const fallbackUrl = jellyfinApi.getDirectStreamUrl(itemId)
        const fallbackRes = await fetch(fallbackUrl, { signal: abortController.signal })
        if (!fallbackRes.ok) {
          throw new Error(`Failed to download media (Status ${fallbackRes.status})`)
        }
        await this.streamIntoCache(itemId, fallbackRes, item)
      } else {
        await this.streamIntoCache(itemId, res, item)
      }

      activeInfo.status = 'completed'
      activeInfo.progress = 100
      this.activeDownloads.delete(itemId)
      await this.notifyListeners()
    } catch (err: any) {
      if (err.name === 'AbortError') {
        activeInfo.status = 'canceled'
      } else {
        activeInfo.status = 'failed'
        activeInfo.error = err.message || 'Download failed'
      }
      this.activeDownloads.delete(itemId)
      await this.notifyListeners()
      throw err
    }
  }

  private async streamIntoCache(
    itemId: string,
    res: Response,
    item: JellyfinItem
  ): Promise<void> {
    const cache = await caches.open(OFFLINE_MEDIA_CACHE)
    const active = this.activeDownloads.get(itemId)
    if (!active) return

    const contentLengthHeader = res.headers.get('content-length')
    const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0
    active.info.totalBytes = totalBytes

    let loadedBytes = 0
    let lastTime = Date.now()
    let lastBytes = 0

    const transformStream = new TransformStream({
      transform: (chunk, controller) => {
        loadedBytes += chunk.length
        active.info.loadedBytes = loadedBytes

        const now = Date.now()
        if (now - lastTime >= 400) {
          active.info.speed = Math.round(((loadedBytes - lastBytes) / (now - lastTime)) * 1000)
          lastTime = now
          lastBytes = loadedBytes
        }

        if (totalBytes > 0) {
          active.info.progress = Math.min(99, Math.round((loadedBytes / totalBytes) * 100))
        } else {
          // If total size unknown, estimate or pulse
          active.info.progress = 50
        }

        this.notifyListeners()
        controller.enqueue(chunk)
      },
    })

    const pipedStream = res.body?.pipeThrough(transformStream)
    const responseHeaders = new Headers(res.headers)
    if (!responseHeaders.has('Content-Type')) {
      responseHeaders.set('Content-Type', 'video/mp4')
    }

    const cachedResponse = new Response(pipedStream, {
      status: 200,
      statusText: 'OK',
      headers: responseHeaders,
    })

    // Store in Cache Storage under /offline-video/{itemId}
    await cache.put(`/offline-video/${itemId}`, cachedResponse)

    // Save metadata record into IndexedDB
    const db = await this.initDb()
    const downloadRecord: DownloadedItem = {
      id: itemId,
      name: item.Name,
      type: item.Type === 'Episode' ? 'Episode' : 'Movie',
      seriesName: item.SeriesName,
      seasonName: item.SeasonName,
      seriesId: item.SeriesId,
      seasonId: item.SeasonId,
      indexNumber: item.IndexNumber,
      productionYear: item.ProductionYear,
      overview: item.Overview,
      runTimeTicks: item.RunTimeTicks,
      fileSize: loadedBytes,
      downloadDate: Date.now(),
      contentType: responseHeaders.get('Content-Type') || 'video/mp4',
      posterUrl: `/offline-poster/${itemId}`,
      item,
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const putReq = store.put(downloadRecord)
      putReq.onsuccess = () => resolve()
      putReq.onerror = () => reject(putReq.error)
    })
  }

  public cancelDownload(itemId: string): void {
    const active = this.activeDownloads.get(itemId)
    if (active) {
      active.abortController.abort()
      this.activeDownloads.delete(itemId)
      this.notifyListeners()
    }
  }

  public async deleteDownload(itemId: string): Promise<void> {
    try {
      const cache = await caches.open(OFFLINE_MEDIA_CACHE)
      await cache.delete(`/offline-video/${itemId}`)
      await cache.delete(`/offline-poster/${itemId}`)

      const db = await this.initDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const delReq = store.delete(itemId)
        delReq.onsuccess = () => resolve()
        delReq.onerror = () => reject(delReq.error)
      })

      await this.notifyListeners()
    } catch (err) {
      console.error('Failed to delete offline download:', err)
    }
  }
}

export const downloadManager = new DownloadManager()
