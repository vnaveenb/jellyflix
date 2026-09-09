import { useEffect } from 'react'

interface KeyboardNavOptions {
  onUp?: () => void
  onDown?: () => void
  onLeft?: () => void
  onRight?: () => void
  onEnter?: () => void
  onBack?: () => void
  onPlayPause?: () => void
  enabled?: boolean
}

export function useKeyboardNav({
  onUp,
  onDown,
  onLeft,
  onRight,
  onEnter,
  onBack,
  onPlayPause,
  enabled = true,
}: KeyboardNavOptions) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting typing in input fields
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') {
          target.blur()
          onBack?.()
        }
        return
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          onUp?.()
          break
        case 'ArrowDown':
          e.preventDefault()
          onDown?.()
          break
        case 'ArrowLeft':
          e.preventDefault()
          onLeft?.()
          break
        case 'ArrowRight':
          e.preventDefault()
          onRight?.()
          break
        case 'Enter':
          e.preventDefault()
          onEnter?.()
          break
        case 'Escape':
        case 'Backspace':
          e.preventDefault()
          onBack?.()
          break
        case ' ': // Space for play/pause
          e.preventDefault()
          onPlayPause?.()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onUp, onDown, onLeft, onRight, onEnter, onBack, onPlayPause])
}
