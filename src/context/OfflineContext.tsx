import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { downloadManager, type DownloadedItem, type ActiveDownload } from '../services/downloadManager'
import type { JellyfinItem } from '../types/jellyfin'

interface OfflineContextType {
  isOfflineMode: boolean
  setIsOfflineMode: (val: boolean) => void
  toggleOfflineMode: () => void
  isNetworkOnline: boolean
  downloads: DownloadedItem[]
  activeDownloads: ActiveDownload[]
  storage: { used: number; quota: number }
  downloadItem: (item: JellyfinItem) => Promise<void>
  cancelDownload: (itemId: string) => void
  deleteDownload: (itemId: string) => Promise<void>
  isDownloaded: (itemId: string) => boolean
  isDownloading: (itemId: string) => boolean
  getDownloadProgress: (itemId: string) => number | null
  refreshDownloads: () => Promise<void>
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined)

export const OfflineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOfflineMode, setIsOfflineModeState] = useState<boolean>(() => {
    return localStorage.getItem('jellyflix_offline_mode') === 'true'
  })
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true
  })
  const [downloads, setDownloads] = useState<DownloadedItem[]>([])
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([])
  const [storage, setStorage] = useState<{ used: number; quota: number }>({ used: 0, quota: 0 })

  const setIsOfflineMode = (val: boolean) => {
    setIsOfflineModeState(val)
    localStorage.setItem('jellyflix_offline_mode', val ? 'true' : 'false')
  }

  const toggleOfflineMode = () => {
    setIsOfflineMode(!isOfflineMode)
  }

  const updateStorage = async () => {
    const est = await downloadManager.getStorageEstimate()
    setStorage(est)
  }

  // Listen to network status (online / offline)
  useEffect(() => {
    const handleOnline = () => {
      setIsNetworkOnline(true)
    }

    const handleOffline = () => {
      setIsNetworkOnline(false)
      // Automatically activate offline mode if network is lost
      setIsOfflineMode(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Subscribe to download updates
  useEffect(() => {
    const unsubscribe = downloadManager.subscribe((items, active) => {
      setDownloads(items)
      setActiveDownloads(active)
      updateStorage()
    })

    updateStorage()
    return () => unsubscribe()
  }, [])

  const downloadItem = async (item: JellyfinItem) => {
    await downloadManager.startDownload(item)
    await updateStorage()
  }

  const cancelDownload = (itemId: string) => {
    downloadManager.cancelDownload(itemId)
  }

  const deleteDownload = async (itemId: string) => {
    await downloadManager.deleteDownload(itemId)
    await updateStorage()
  }

  const isDownloaded = (itemId: string) => {
    return downloads.some((d) => d.id === itemId)
  }

  const isDownloading = (itemId: string) => {
    return activeDownloads.some((a) => a.itemId === itemId && a.status === 'downloading')
  }

  const getDownloadProgress = (itemId: string): number | null => {
    const active = activeDownloads.find((a) => a.itemId === itemId)
    return active ? active.progress : null
  }

  const refreshDownloads = async () => {
    const items = await downloadManager.getAllDownloads()
    setDownloads(items)
    await updateStorage()
  }

  return (
    <OfflineContext.Provider
      value={{
        isOfflineMode,
        setIsOfflineMode,
        toggleOfflineMode,
        isNetworkOnline,
        downloads,
        activeDownloads,
        storage,
        downloadItem,
        cancelDownload,
        deleteDownload,
        isDownloaded,
        isDownloading,
        getDownloadProgress,
        refreshDownloads,
      }}
    >
      {children}
    </OfflineContext.Provider>
  )
}

export const useOffline = () => {
  const context = useContext(OfflineContext)
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider')
  }
  return context
}
