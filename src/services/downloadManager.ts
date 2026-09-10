import { jellyfinApi } from '../api/jellyfin'
import type { JellyfinItem } from '../types/jellyfin'

export const OFFLINE_MEDIA_CACHE = 'jellyflix-downloads-v1'
const DB_NAME = 'jellyflix_offline_db'
const DB_VERSION = 2
const STORE_NAME = 'downloads'
const STORE_PARTIAL = 'partial_downloads'
const STORE_CHUNKS = 'download_chunks'
const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB chunks for smooth streaming & disk persistence

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
  status: 'downloading' | 'paused' | 'interrupted' | 'completed' | 'failed' | 'canceled'
  error?: string
  item: JellyfinItem
  updatedAt: number
}

interface StoredChunk {
  chunkId: string
  itemId: string
  chunkIndex: number
  data: Blob
}

type DownloadListener = (downloads: DownloadedItem[], active: ActiveDownload[]) => void

class DownloadManager {
  private dbPromise: Promise<IDBDatabase> | null = null
  private activeDownloads = new Map<string, {
    info: ActiveDownload
    abortController?: AbortController
  }>()
  private listeners: Set<DownloadListener> = new Set()

  constructor() {
    this.init()
  }

  private async init() {
    try {
      await this.initDb()
      await this.restorePartialDownloads()
      this.notifyListeners()
    } catch (e) {
      console.error('Failed to initialize DownloadManager:', e)
    }
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
        // 1. Completed downloads store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('type', 'type', { unique: false })
          store.createIndex('downloadDate', 'downloadDate', { unique: false })
          store.createIndex('seriesId', 'seriesId', { unique: false })
        }

        // 2. Partial downloads state store
        if (!db.objectStoreNames.contains(STORE_PARTIAL)) {
          const partialStore = db.createObjectStore(STORE_PARTIAL, { keyPath: 'itemId' })
          partialStore.createIndex('status', 'status', { unique: false })
          partialStore.createIndex('updatedAt', 'updatedAt', { unique: false })
        }

        // 3. Binary video chunks store
        if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
          const chunkStore = db.createObjectStore(STORE_CHUNKS, { keyPath: 'chunkId' })
          chunkStore.createIndex('itemId', 'itemId', { unique: false })
          chunkStore.createIndex('chunkIndex', 'chunkIndex', { unique: false })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    return this.dbPromise
  }

  // Restore incomplete downloads on reload (e.g. 30% or 98%)
  private async restorePartialDownloads() {
    try {
      const db = await this.initDb()
      const tx = db.transaction(STORE_PARTIAL, 'readwrite')
      const store = tx.objectStore(STORE_PARTIAL)
      const req = store.getAll()

      req.onsuccess = () => {
        const partials: ActiveDownload[] = req.result || []
        for (const p of partials) {
          // If was downloading when tab was closed/reloaded, mark as interrupted/paused
          if (p.status === 'downloading') {
            p.status = 'interrupted'
            p.speed = 0
            store.put(p)
          }
          this.activeDownloads.set(p.itemId, {
            info: { ...p },
          })
        }
      }
    } catch (err) {
      console.warn('Failed to restore partial downloads:', err)
    }
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

  public getDownloadStatus(itemId: string): ActiveDownload['status'] | null {
    const item = this.activeDownloads.get(itemId)
    return item ? item.info.status : null
  }

  // Save partial state to IndexedDB
  private async persistPartialInfo(info: ActiveDownload) {
    try {
      const db = await this.initDb()
      const tx = db.transaction(STORE_PARTIAL, 'readwrite')
      const store = tx.objectStore(STORE_PARTIAL)
      store.put(info)
    } catch (e) {
      console.warn('Could not persist partial download state:', e)
    }
  }

  // Save a binary chunk to IndexedDB
  private async saveChunk(itemId: string, chunkIndex: number, blob: Blob) {
    try {
      const db = await this.initDb()
      const tx = db.transaction(STORE_CHUNKS, 'readwrite')
      const store = tx.objectStore(STORE_CHUNKS)
      const chunkId = `${itemId}_chunk_${String(chunkIndex).padStart(6, '0')}`
      store.put({
        chunkId,
        itemId,
        chunkIndex,
        data: blob,
      } as StoredChunk)
    } catch (e) {
      console.error('Failed to save download chunk to IndexedDB:', e)
    }
  }

  // Retrieve all chunks for an item in sequential order
  private async getStoredChunksForItem(itemId: string): Promise<Blob[]> {
    const db = await this.initDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readonly')
      const store = tx.objectStore(STORE_CHUNKS)
      const index = store.index('itemId')
      const req = index.getAll(IDBKeyRange.only(itemId))

      req.onsuccess = () => {
        const items: StoredChunk[] = req.result || []
        // Sort strictly by chunkIndex
        items.sort((a, b) => a.chunkIndex - b.chunkIndex)
        resolve(items.map((it) => it.data))
      }
      req.onerror = () => reject(req.error)
    })
  }

  // Delete all partial chunks for an item
  private async deleteStoredChunksForItem(itemId: string) {
    try {
      const db = await this.initDb()
      const tx = db.transaction(STORE_CHUNKS, 'readwrite')
      const store = tx.objectStore(STORE_CHUNKS)
      const index = store.index('itemId')
      const req = index.openKeyCursor(IDBKeyRange.only(itemId))

      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          store.delete(cursor.primaryKey)
          cursor.continue()
        }
      }
    } catch (e) {
      console.warn('Error deleting stored chunks for item:', e)
    }
  }

  // Start or Resume Download
  public async startDownload(item: JellyfinItem): Promise<void> {
    const itemId = item.Id
    if (await this.isItemDownloaded(itemId)) return

    // If already downloading, don't start duplicate
    const existing = this.activeDownloads.get(itemId)
    if (existing && existing.info.status === 'downloading') return

    // Request persistent storage so browser does not evict downloaded content
    await this.requestStoragePersistence()

    const abortController = new AbortController()
    let startByte = 0
    let totalBytes = 0

    if (existing && existing.info.loadedBytes > 0) {
      startByte = existing.info.loadedBytes
      totalBytes = existing.info.totalBytes
    }

    const activeInfo: ActiveDownload = {
      itemId,
      name: item.Name,
      type: item.Type === 'Episode' ? 'Episode' : 'Movie',
      progress: totalBytes > 0 ? Math.round((startByte / totalBytes) * 100) : 0,
      loadedBytes: startByte,
      totalBytes,
      speed: 0,
      status: 'downloading',
      item,
      updatedAt: Date.now(),
    }

    this.activeDownloads.set(itemId, { info: activeInfo, abortController })
    await this.persistPartialInfo(activeInfo)
    this.notifyListeners()

    try {
      const cache = await caches.open(OFFLINE_MEDIA_CACHE)

      // 1. Download & cache poster if not present
      try {
        const posterUrl = jellyfinApi.getImageUrl(item.Id, 'Primary', { maxWidth: 600, quality: 90 })
        const existingPoster = await cache.match(`/offline-poster/${itemId}`)
        if (!existingPoster) {
          const posterRes = await fetch(posterUrl, { signal: abortController.signal })
          if (posterRes.ok) {
            await cache.put(`/offline-poster/${itemId}`, posterRes)
          }
        }
      } catch (e) {
        console.warn('Could not cache offline poster:', e)
      }

      // 2. HTTP Byte Range Request for Resumable Download
      const downloadUrl = jellyfinApi.getItemDownloadUrl(itemId)
      const headers: Record<string, string> = {}

      if (startByte > 0) {
        headers['Range'] = `bytes=${startByte}-`
      }

      let res = await fetch(downloadUrl, {
        headers,
        signal: abortController.signal,
      })

      if (!res.ok && res.status !== 206) {
        // Fallback to static direct stream URL
        const fallbackUrl = jellyfinApi.getDirectStreamUrl(itemId)
        res = await fetch(fallbackUrl, {
          headers,
          signal: abortController.signal,
        })
        if (!res.ok && res.status !== 206) {
          throw new Error(`Failed to download media (Status ${res.status})`)
        }
      }

      // Determine total bytes
      if (res.status === 206) {
        // Content-Range: bytes 1000-2000/2001
        const contentRange = res.headers.get('content-range')
        if (contentRange) {
          const match = contentRange.match(/\/(\d+)$/)
          if (match) {
            totalBytes = parseInt(match[1], 10)
          }
        }
        if (!totalBytes) {
          const cl = res.headers.get('content-length')
          totalBytes = startByte + (cl ? parseInt(cl, 10) : 0)
        }
      } else {
        // Full response (200 OK)
        startByte = 0
        const cl = res.headers.get('content-length')
        totalBytes = cl ? parseInt(cl, 10) : 0
      }

      activeInfo.totalBytes = totalBytes
      activeInfo.loadedBytes = startByte
      const contentType = res.headers.get('content-type') || 'video/mp4'

      if (!res.body) {
        throw new Error('ReadableStream not supported by browser response')
      }

      // Stream into chunks
      const reader = res.body.getReader()
      let loadedBytes = startByte
      let lastTime = Date.now()
      let lastLoadedForSpeed = loadedBytes
      let chunkIndex = Math.floor(startByte / CHUNK_SIZE)
      let buffer: Uint8Array[] = []
      let bufferSize = 0

      while (true) {
        const { done, value } = await reader.read()

        if (value) {
          buffer.push(value)
          bufferSize += value.length
          loadedBytes += value.length
          activeInfo.loadedBytes = loadedBytes

          if (totalBytes > 0) {
            activeInfo.progress = Math.min(99, Math.round((loadedBytes / totalBytes) * 100))
          }

          const now = Date.now()
          if (now - lastTime >= 500) {
            const bytesSince = loadedBytes - lastLoadedForSpeed
            activeInfo.speed = Math.round((bytesSince / (now - lastTime)) * 1000)
            activeInfo.updatedAt = now
            lastTime = now
            lastLoadedForSpeed = loadedBytes
            this.notifyListeners()
          }

          // If chunk buffer reached 4MB, commit to IndexedDB
          if (bufferSize >= CHUNK_SIZE) {
            const chunkBlob = new Blob(buffer as BlobPart[])
            await this.saveChunk(itemId, chunkIndex, chunkBlob)
            chunkIndex++
            buffer = []
            bufferSize = 0
            await this.persistPartialInfo(activeInfo)
          }
        }

        if (done) {
          // Save remaining buffer if any
          if (bufferSize > 0) {
            const chunkBlob = new Blob(buffer as BlobPart[])
            await this.saveChunk(itemId, chunkIndex, chunkBlob)
            chunkIndex++
            buffer = []
            bufferSize = 0
          }
          break
        }
      }

      // 3. Assemble full video Blob from stored chunks
      activeInfo.status = 'completed'
      activeInfo.progress = 100
      this.notifyListeners()

      const allStoredChunks = await this.getStoredChunksForItem(itemId)
      const fullBlob = new Blob(allStoredChunks, { type: contentType })

      // Put full blob into Cache Storage for instant offline HTTP 206 range playback
      const cacheResponse = new Response(fullBlob, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(fullBlob.size),
          'Accept-Ranges': 'bytes',
        },
      })
      await cache.put(`/offline-video/${itemId}`, cacheResponse)

      // Save complete record to IndexedDB
      const db = await this.initDb()
      const tx = db.transaction([STORE_NAME, STORE_PARTIAL], 'readwrite')
      const downloadsStore = tx.objectStore(STORE_NAME)
      const partialStore = tx.objectStore(STORE_PARTIAL)

      const completedRecord: DownloadedItem = {
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
        fileSize: fullBlob.size,
        downloadDate: Date.now(),
        contentType,
        posterUrl: `/offline-poster/${itemId}`,
        item,
      }

      downloadsStore.put(completedRecord)
      partialStore.delete(itemId)

      // Clean up raw chunks to free up IndexedDB space (it's now safely in Cache Storage)
      await this.deleteStoredChunksForItem(itemId)

      this.activeDownloads.delete(itemId)
      await this.notifyListeners()
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Paused or canceled
        if (activeInfo.status !== 'canceled') {
          activeInfo.status = 'paused'
        }
      } else {
        console.error('Download stream error:', err)
        activeInfo.status = 'failed'
        activeInfo.error = err.message || 'Download failed'
      }

      activeInfo.speed = 0
      activeInfo.updatedAt = Date.now()
      await this.persistPartialInfo(activeInfo)

      if (activeInfo.status === 'canceled') {
        this.activeDownloads.delete(itemId)
        await this.deleteStoredChunksForItem(itemId)
        const db = await this.initDb()
        const tx = db.transaction(STORE_PARTIAL, 'readwrite')
        tx.objectStore(STORE_PARTIAL).delete(itemId)
      }

      this.notifyListeners()
      throw err
    }
  }

  // Pause an in-flight download
  public async pauseDownload(itemId: string): Promise<void> {
    const entry = this.activeDownloads.get(itemId)
    if (entry && entry.abortController) {
      entry.info.status = 'paused'
      entry.info.speed = 0
      entry.abortController.abort()
      await this.persistPartialInfo(entry.info)
      this.notifyListeners()
    }
  }

  // Resume a paused or interrupted download
  public async resumeDownload(itemId: string): Promise<void> {
    const entry = this.activeDownloads.get(itemId)
    if (entry && entry.info.item) {
      await this.startDownload(entry.info.item)
    } else {
      // Look up in partial_downloads
      const db = await this.initDb()
      const tx = db.transaction(STORE_PARTIAL, 'readonly')
      const store = tx.objectStore(STORE_PARTIAL)
      const req = store.get(itemId)
      req.onsuccess = () => {
        const record: ActiveDownload = req.result
        if (record && record.item) {
          this.startDownload(record.item)
        }
      }
    }
  }

  // Cancel and delete partial download data
  public async cancelDownload(itemId: string): Promise<void> {
    const entry = this.activeDownloads.get(itemId)
    if (entry) {
      entry.info.status = 'canceled'
      if (entry.abortController) {
        entry.abortController.abort()
      }
      this.activeDownloads.delete(itemId)
    }

    await this.deleteStoredChunksForItem(itemId)

    try {
      const db = await this.initDb()
      const tx = db.transaction(STORE_PARTIAL, 'readwrite')
      tx.objectStore(STORE_PARTIAL).delete(itemId)
    } catch (e) {
      console.warn('Error deleting partial download from IndexedDB:', e)
    }

    this.notifyListeners()
  }

  // Delete a completed download from Cache & DB
  public async deleteDownload(itemId: string): Promise<void> {
    try {
      const cache = await caches.open(OFFLINE_MEDIA_CACHE)
      await cache.delete(`/offline-video/${itemId}`)
      await cache.delete(`/offline-poster/${itemId}`)

      const db = await this.initDb()
      const tx = db.transaction([STORE_NAME, STORE_PARTIAL], 'readwrite')
      tx.objectStore(STORE_NAME).delete(itemId)
      tx.objectStore(STORE_PARTIAL).delete(itemId)

      await this.deleteStoredChunksForItem(itemId)
      this.activeDownloads.delete(itemId)
      await this.notifyListeners()
    } catch (err) {
      console.error('Failed to delete download:', err)
      throw err
    }
  }
}

export const downloadManager = new DownloadManager()
