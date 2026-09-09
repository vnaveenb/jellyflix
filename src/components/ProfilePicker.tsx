import React, { useState } from 'react'
import { Plus, Server, Lock } from 'lucide-react'
import type { JellyfinUser } from '../types/jellyfin'
import { useAuth } from '../context/AuthContext'
import { jellyfinApi } from '../api/jellyfin'

interface ProfilePickerProps {
  onSelectUser: (user: JellyfinUser) => void
  onOpenLogin: () => void
  onOpenServerSettings: () => void
}

export const ProfilePicker: React.FC<ProfilePickerProps> = ({
  onSelectUser,
  onOpenLogin,
  onOpenServerSettings,
}) => {
  const { savedUsers, selectProfile, error, clearError } = useAuth()
  const [selectedUser, setSelectedUser] = useState<JellyfinUser | null>(null)
  const [password, setPassword] = useState('')
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCardClick = async (u: JellyfinUser) => {
    clearError()
    // Check if user requires password
    if (u.HasConfiguredPassword || u.HasPassword) {
      setSelectedUser(u)
      setPassword('')
      setShowPasswordModal(true)
    } else {
      // Try auto-selecting user without password
      const ok = await selectProfile(u)
      if (ok) {
        onSelectUser(u)
      } else {
        // If it failed, show password input
        setSelectedUser(u)
        setShowPasswordModal(true)
      }
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return
    setIsSubmitting(true)
    const ok = await selectProfile(selectedUser, password)
    setIsSubmitting(false)
    if (ok) {
      setShowPasswordModal(false)
      onSelectUser(selectedUser)
    }
  }

  return (
    <div className="profile-screen">
      <div style={{ position: 'absolute', top: 30, left: '4%' }}>
        <div className="brand-logo">
          <span>JELLYFLIX</span>
          <span className="brand-badge">OMV</span>
        </div>
      </div>

      <h1 className="profile-title">Who's watching?</h1>

      <div className="profile-grid">
        {savedUsers.map((u) => {
          const userAvatarUrl = jellyfinApi.getUserImageUrl(u.Id, u.PrimaryImageTag)
          return (
            <button
              key={u.Id}
              className="profile-card"
              onClick={() => handleCardClick(u)}
              title={u.Name}
            >
              <div className="profile-avatar-box">
                {u.PrimaryImageTag ? (
                  <img
                    src={userAvatarUrl}
                    alt={u.Name}
                    className="profile-avatar-img"
                    onError={(e) => {
                      ;(e.target as HTMLElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <span className="profile-initial">{u.Name.charAt(0).toUpperCase()}</span>
                )}
                {(u.HasConfiguredPassword || u.HasPassword) && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      right: 8,
                      background: 'rgba(0,0,0,0.7)',
                      padding: 4,
                      borderRadius: 4,
                    }}
                  >
                    <Lock size={14} color="#fff" />
                  </div>
                )}
              </div>
              <span className="profile-name">{u.Name}</span>
            </button>
          )
        })}

        {/* Add Profile / Sign in with another account */}
        <button className="profile-card" onClick={onOpenLogin} title="Sign in or add profile">
          <div
            className="profile-avatar-box"
            style={{
              background: 'transparent',
              border: '2px dashed rgba(255,255,255,0.3)',
            }}
          >
            <Plus size={48} color="#aaa" />
          </div>
          <span className="profile-name">Add Profile</span>
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <button className="btn-manage-profiles" onClick={onOpenLogin}>
          Sign In
        </button>
        <button className="btn-manage-profiles" onClick={onOpenServerSettings}>
          <Server size={16} style={{ display: 'inline', marginRight: 6 }} />
          Server Settings
        </button>
      </div>

      {/* Password Modal for Protected User */}
      {showPasswordModal && selectedUser && (
        <div className="modal-backdrop" onClick={() => setShowPasswordModal(false)}>
          <div className="auth-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                className="profile-avatar-box"
                style={{ width: 60, height: 60, borderRadius: 8 }}
              >
                <span className="profile-initial" style={{ fontSize: '1.5rem' }}>
                  {selectedUser.Name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h3 style={{ fontSize: '1.3rem' }}>{selectedUser.Name}</h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Enter your password to continue
                </span>
              </div>
            </div>

            {error && (
              <div
                style={{
                  background: 'rgba(229, 9, 20, 0.2)',
                  border: '1px solid var(--netflix-red)',
                  padding: 10,
                  borderRadius: 4,
                  fontSize: '0.88rem',
                  color: '#ff8a8a',
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <button
                  type="submit"
                  className="btn-primary-red"
                  style={{ flex: 1 }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Verifying...' : 'Sign In'}
                </button>
                <button
                  type="button"
                  className="btn-manage-profiles"
                  onClick={() => setShowPasswordModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
