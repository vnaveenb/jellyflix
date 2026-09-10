import React, { useState } from 'react'
import { X, Server } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface LoginModalProps {
  onClose: () => void
  onSuccess: () => void
}

export const LoginModal: React.FC<LoginModalProps> = ({ onClose, onSuccess }) => {
  const { login, serverUrl, error, clearError } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return
    setIsSubmitting(true)
    clearError()

    const ok = await login(username.trim(), password)
    setIsSubmitting(false)
    if (ok) {
      onSuccess()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="auth-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700 }}>Sign In</h2>
          <button className="modal-close-btn" style={{ position: 'static' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#888' }}>
          <Server size={14} color="#E50914" />
          <span>Server: {serverUrl || 'Default (OMV Server)'}</span>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(229, 9, 20, 0.2)',
              border: '1px solid var(--netflix-red)',
              padding: 12,
              borderRadius: 4,
              fontSize: '0.88rem',
              color: '#ff8a8a',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-input"
              placeholder="Jellyfin Username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn-primary-red"
            disabled={isSubmitting || !username.trim()}
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
