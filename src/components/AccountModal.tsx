import React, { useState } from 'react'
import {
  X,
  User,
  Shield,
  Key,
  Eye,
  EyeOff,
  LogOut,
  Server,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  HardDrive,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { jellyfinApi } from '../api/jellyfin'

interface AccountModalProps {
  onClose: () => void
  onOpenServerSettings: () => void
  onSwitchProfile: () => void
}

export const AccountModal: React.FC<AccountModalProps> = ({
  onClose,
  onOpenServerSettings,
  onSwitchProfile,
}) => {
  const { user, serverUrl, logout } = useAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  const [isUpdating, setIsUpdating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatusMessage(null)

    if (!user) return

    if (!newPassword) {
      setStatusMessage({ type: 'error', text: 'New password cannot be empty' })
      return
    }

    if (newPassword !== confirmPassword) {
      setStatusMessage({ type: 'error', text: 'New passwords do not match' })
      return
    }

    if (newPassword.length < 4) {
      setStatusMessage({
        type: 'error',
        text: 'Password must be at least 4 characters',
      })
      return
    }

    setIsUpdating(true)
    try {
      await jellyfinApi.updatePassword(user.Id, currentPassword, newPassword)
      setStatusMessage({
        type: 'success',
        text: 'Password successfully updated on Jellyfin server!',
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      console.error('Password update error:', err)
      setStatusMessage({
        type: 'error',
        text:
          err.message ||
          'Failed to update password. Please check your current password.',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleSignOut = () => {
    if (window.confirm('Are you sure you want to sign out of JellyFlix?')) {
      onClose()
      logout()
    }
  }

  const userAvatarUrl = user?.Id
    ? jellyfinApi.getUserImageUrl(user.Id, user.PrimaryImageTag)
    : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="account-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="account-modal-header">
          <div className="account-modal-header-title">
            <User size={22} color="#E50914" />
            <h3>Account & Security</h3>
          </div>
          <button
            className="account-modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="account-modal-body">
          {/* User Profile Card */}
          <div className="account-profile-card">
            <div className="account-profile-avatar-wrap">
              {userAvatarUrl ? (
                <img
                  src={userAvatarUrl}
                  alt={user?.Name}
                  className="account-avatar-img"
                  onError={(e) => {
                    ;(e.target as HTMLElement).style.display = 'none'
                  }}
                />
              ) : (
                <div className="account-avatar-fallback">
                  {user?.Name ? user.Name.charAt(0).toUpperCase() : <User size={24} />}
                </div>
              )}
            </div>

            <div className="account-profile-info">
              <div className="account-profile-name-row">
                <span className="account-profile-name">{user?.Name || 'User'}</span>
                {user?.Policy?.IsAdministrator && (
                  <span className="account-badge admin-badge">
                    <Shield size={11} />
                    Admin
                  </span>
                )}
                <span className="account-badge session-badge">
                  <Clock size={11} />
                  30-Day Session
                </span>
              </div>

              <div className="account-meta-row">
                <span className="account-meta-item">
                  <HardDrive size={13} color="#888" />
                  <span className="account-meta-text">
                    Server: {serverUrl || 'Local Proxy (/jellyfin-api)'}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Change Password Form */}
          <div className="account-card-section">
            <div className="account-section-title-row">
              <Key size={18} color="#E50914" />
              <h4>Change Password</h4>
            </div>
            <p className="account-section-desc">
              Update your password directly on your Jellyfin server.
            </p>

            {statusMessage && (
              <div
                className={`account-status-banner ${statusMessage.type === 'success' ? 'success' : 'error'}`}
              >
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 size={16} color="#46d369" />
                ) : (
                  <AlertCircle size={16} color="#E50914" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="account-pw-form">
              <div className="account-input-group">
                <label>Current Password</label>
                <div className="account-input-wrapper">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="pw-toggle-btn"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    tabIndex={-1}
                  >
                    {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="account-input-group">
                <label>New Password</label>
                <div className="account-input-wrapper">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="pw-toggle-btn"
                    onClick={() => setShowNewPw(!showNewPw)}
                    tabIndex={-1}
                  >
                    {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="account-input-group">
                <label>Confirm New Password</label>
                <div className="account-input-wrapper">
                  <input
                    type={showConfirmPw ? 'text' : 'password'}
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="pw-toggle-btn"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    tabIndex={-1}
                  >
                    {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="account-submit-pw-btn"
                disabled={isUpdating}
              >
                {isUpdating ? 'Updating Password...' : 'Update Password'}
              </button>
            </form>
          </div>

          {/* Quick Actions (Switch Profile, Server Settings) */}
          <div className="account-card-section">
            <div className="account-section-title-row">
              <Users size={18} color="#aaa" />
              <h4>Account Actions</h4>
            </div>

            <div className="account-actions-grid">
              <button
                className="account-action-tile"
                onClick={() => {
                  onClose()
                  onSwitchProfile()
                }}
              >
                <Users size={18} color="#E50914" />
                <div className="tile-text">
                  <span className="tile-title">Switch Profile</span>
                  <span className="tile-sub">Select another user on this server</span>
                </div>
              </button>

              <button
                className="account-action-tile"
                onClick={() => {
                  onClose()
                  onOpenServerSettings()
                }}
              >
                <Server size={18} color="#46d369" />
                <div className="tile-text">
                  <span className="tile-title">Server Settings</span>
                  <span className="tile-sub">Configure Jellyfin server URL</span>
                </div>
              </button>
            </div>
          </div>

          {/* Sign Out Section */}
          <div className="account-card-section danger-section">
            <div className="account-section-title-row">
              <LogOut size={18} color="#E50914" />
              <h4>Sign Out</h4>
            </div>
            <p className="account-section-desc">
              Signing out will clear your 30-day session and return you to the profile selection screen.
            </p>

            <button className="account-signout-btn" onClick={handleSignOut}>
              <LogOut size={18} />
              <span>Sign Out of JellyFlix</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
