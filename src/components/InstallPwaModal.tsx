import React, { useEffect } from 'react'
import { X, Share2, PlusSquare, Download, MoreVertical, Smartphone } from 'lucide-react'

interface InstallPwaModalProps {
  isOpen: boolean
  onClose: () => void
  onInstallDirect?: () => void
  hasNativePrompt?: boolean
  isIOS?: boolean
  isAndroid?: boolean
}

export const InstallPwaModal: React.FC<InstallPwaModalProps> = ({
  isOpen,
  onClose,
  onInstallDirect,
  hasNativePrompt,
  isIOS,
  isAndroid,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #1f1f1f 0%, #141414 100%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '440px',
          padding: '1.75rem',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), 0 0 40px rgba(229, 9, 20, 0.15)',
          color: '#ffffff',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close modal"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          <X size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '1.25rem' }}>
          <img
            src="/icons/pwa-192x192.png"
            alt="JellyFlix"
            style={{ width: '52px', height: '52px', borderRadius: '14px', boxShadow: '0 4px 14px rgba(0,0,0,0.6)' }}
          />
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Install JellyFlix</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#aaaaaa' }}>
              {isIOS ? 'Add to iPhone / iPad' : isAndroid ? 'Add to Android Device' : 'Install Desktop App'}
            </p>
          </div>
        </div>

        <p style={{ fontSize: '0.9rem', color: '#cccccc', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          Install JellyFlix for full screen cinema playback, faster load times, and an ad-free app experience.
        </p>

        {/* Direct One-Click Install Button if browser prompt is ready */}
        {hasNativePrompt && (
          <button
            onClick={() => {
              if (onInstallDirect) onInstallDirect()
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              background: '#E50914',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 18px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '1.25rem',
              boxShadow: '0 4px 16px rgba(229, 9, 20, 0.4)',
            }}
          >
            <Download size={20} />
            <span>Install Now</span>
          </button>
        )}

        {/* iOS Step-by-Step */}
        {isIOS ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(229, 9, 20, 0.2)',
                  color: '#E50914',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Share2 size={18} />
              </div>
              <div style={{ fontSize: '0.875rem' }}>
                <strong>Step 1:</strong> Tap the <strong>Share</strong> button in Safari toolbar.
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(229, 9, 20, 0.2)',
                  color: '#E50914',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <PlusSquare size={18} />
              </div>
              <div style={{ fontSize: '0.875rem' }}>
                <strong>Step 2:</strong> Scroll down and select <strong>Add to Home Screen</strong>.
              </div>
            </div>
          </div>
        ) : (
          /* Android & Desktop Manual Guide */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(229, 9, 20, 0.2)',
                  color: '#E50914',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <MoreVertical size={18} />
              </div>
              <div style={{ fontSize: '0.875rem' }}>
                <strong>Step 1:</strong> Tap the <strong>three dots (⋮)</strong> menu in Chrome or your browser.
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(229, 9, 20, 0.2)',
                  color: '#E50914',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Smartphone size={18} />
              </div>
              <div style={{ fontSize: '0.875rem' }}>
                <strong>Step 2:</strong> Tap <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
