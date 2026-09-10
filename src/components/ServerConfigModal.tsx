import React, { useState } from 'react'
import { X, Server, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { jellyfinApi } from '../api/jellyfin'

interface ServerConfigModalProps {
  onClose: () => void
}

export const ServerConfigModal: React.FC<ServerConfigModalProps> = ({ onClose }) => {
  const { serverUrl, setCustomServerUrl } = useAuth()
  const [urlInput, setUrlInput] = useState(serverUrl)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    serverName?: string
    version?: string
    error?: string
  } | null>(null)

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setTesting(true)
    setTestResult(null)

    try {
      const ok = await setCustomServerUrl(urlInput.trim())
      if (ok) {
        const info = await jellyfinApi.getPublicInfo()
        setTestResult({
          success: true,
          serverName: info.ServerName || 'Jellyfin Server',
          version: info.Version || '12.0.0',
        })
      } else {
        setTestResult({
          success: false,
          error: 'Connection failed. Please check the address and port.',
        })
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Connection failed',
      })
    } finally {
      setTesting(false)
    }
  }

  const handleResetDefault = async () => {
    setUrlInput('')
    setTesting(true)
    setTestResult(null)
    try {
      const ok = await setCustomServerUrl('')
      if (ok) {
        const info = await jellyfinApi.getPublicInfo()
        setTestResult({
          success: true,
          serverName: info.ServerName || 'Jellyfin Server',
          version: info.Version || '12.0.0',
        })
      } else {
        setTestResult({
          success: false,
          error: 'Failed to connect to default built-in proxy.',
        })
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Connection failed',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="auth-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Server size={22} color="#E50914" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Jellyfin Server</h2>
          </div>
          <button className="modal-close-btn" style={{ position: 'static' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '0.88rem', color: '#aaa', lineHeight: 1.5 }}>
          By default, JellyFlix uses the built-in proxy (works seamlessly across Local Wi-Fi, Tailscale, and Remote access).
        </p>

        {testResult && (
          <div
            style={{
              background: testResult.success ? 'rgba(70, 211, 105, 0.15)' : 'rgba(229, 9, 20, 0.2)',
              border: `1px solid ${testResult.success ? '#46d369' : '#E50914'}`,
              padding: 12,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: '0.88rem',
            }}
          >
            {testResult.success ? (
              <>
                <CheckCircle2 size={18} color="#46d369" />
                <div>
                  <strong>Connected!</strong> {testResult.serverName} (v{testResult.version})
                </div>
              </>
            ) : (
              <>
                <AlertCircle size={18} color="#E50914" />
                <div>{testResult.error}</div>
              </>
            )}
          </div>
        )}

        <form onSubmit={handleTestAndSave} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="form-group">
            <label className="form-label">Server Address (Optional override)</label>
            <input
              type="text"
              className="form-input"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Leave empty for default built-in server"
            />
            <span style={{ fontSize: '0.78rem', color: '#777', marginTop: 4, display: 'block' }}>
              Current: {serverUrl ? serverUrl : 'Built-in Reverse Proxy (/jellyfin-api)'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              className="btn-primary-red"
              style={{ flex: 1 }}
              disabled={testing}
            >
              {testing ? 'Testing...' : 'Save & Connect'}
            </button>
            <button
              type="button"
              className="btn-manage-profiles"
              onClick={handleResetDefault}
              disabled={testing}
            >
              Reset Default
            </button>
            <button type="button" className="btn-manage-profiles" onClick={onClose}>
              Done
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
