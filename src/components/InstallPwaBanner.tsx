import React, { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

interface InstallPwaBannerProps {
  onInstall: () => void
  isInstalled: boolean
}

export const InstallPwaBanner: React.FC<InstallPwaBannerProps> = ({ onInstall, isInstalled }) => {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (isInstalled) return
    const isDismissed = sessionStorage.getItem('dismissed_pwa_banner') === '1'
    if (!isDismissed) {
      // Show after 2.5 seconds on first visit
      const timer = setTimeout(() => setDismissed(false), 2500)
      return () => clearTimeout(timer)
    }
  }, [isInstalled])

  if (isInstalled || dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    sessionStorage.setItem('dismissed_pwa_banner', '1')
  }

  return (
    <div className="mobile-pwa-banner">
      <div className="mobile-pwa-banner-left">
        <img src="/icons/pwa-64x64.png" alt="JellyFlix" className="mobile-pwa-icon" />
        <div className="mobile-pwa-text">
          <span className="mobile-pwa-title">Install JellyFlix App</span>
          <span className="mobile-pwa-desc">Full screen playback &amp; faster browsing</span>
        </div>
      </div>
      <div className="mobile-pwa-banner-actions">
        <button className="mobile-pwa-install-btn" onClick={onInstall}>
          <Download size={14} />
          <span>Install</span>
        </button>
        <button className="mobile-pwa-close-btn" onClick={handleDismiss} aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
