import { useState, useEffect, useCallback } from 'react'

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

declare global {
  interface Window {
    __deferredPrompt?: BeforeInstallPromptEvent | null
  }
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    typeof window !== 'undefined' && window.__deferredPrompt ? window.__deferredPrompt : null
  )
  const [isInstalled, setIsInstalled] = useState(false)
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [showInstallModal, setShowInstallModal] = useState(false)

  // Detect platform
  const isIOS =
    typeof window !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream

  const isAndroid =
    typeof window !== 'undefined' && /Android/i.test(navigator.userAgent)

  // Check standalone mode
  const checkIsInstalled = useCallback(() => {
    if (typeof window === 'undefined') return
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app://')

    setIsInstalled(isStandalone)
  }, [])

  useEffect(() => {
    checkIsInstalled()

    // 1. Immediately register Service Worker
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.MODE !== 'test') {
      const registerSW = () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            registration.onupdatefound = () => {
              const installingWorker = registration.installing
              if (installingWorker) {
                installingWorker.onstatechange = () => {
                  if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[PWA] New version installed and active.')
                  }
                }
              }
            }
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err)
          })
      }

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        registerSW()
      } else {
        window.addEventListener('load', registerSW)
      }
    }

    // 2. Intercept BeforeInstallPrompt for Android & Windows / Chrome / Edge
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      const pEvent = e as BeforeInstallPromptEvent
      window.__deferredPrompt = pEvent
      setDeferredPrompt(pEvent)
    }

    // Also check if already saved in window
    if (window.__deferredPrompt) {
      setDeferredPrompt(window.__deferredPrompt)
    }

    // 3. App Installed event
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      window.__deferredPrompt = null
      setShowInstallModal(false)
      console.log('[PWA] JellyFlix successfully installed.')
    }

    // 4. Online/Offline status
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [checkIsInstalled])

  const installApp = async () => {
    const promptEvent = deferredPrompt || window.__deferredPrompt
    if (promptEvent) {
      try {
        await promptEvent.prompt()
        const { outcome } = await promptEvent.userChoice
        if (outcome === 'accepted') {
          setIsInstalled(true)
        }
        setDeferredPrompt(null)
        window.__deferredPrompt = null
      } catch (err) {
        console.warn('[PWA] Install prompt failed:', err)
        setShowInstallModal(true)
      }
    } else {
      // If native prompt not directly dispatched yet, show guided modal
      setShowInstallModal(true)
    }
  }

  return {
    canInstall: !isInstalled,
    hasNativePrompt: !!deferredPrompt || !!window.__deferredPrompt,
    isInstalled,
    isOnline,
    isIOS,
    isAndroid,
    showInstallModal,
    setShowInstallModal,
    installApp,
  }
}
