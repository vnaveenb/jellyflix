import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { JellyfinUser } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'

export const AUTH_SESSION_TTL = 30 * 24 * 60 * 60 * 1000 // 30 Days in milliseconds

interface AuthContextType {
  user: JellyfinUser | null
  token: string | null
  serverUrl: string
  savedUsers: JellyfinUser[]
  isLoading: boolean
  error: string | null
  isProfileConfirmed: boolean
  setProfileConfirmed: (confirmed: boolean) => void
  login: (username: string, password?: string) => Promise<boolean>
  selectProfile: (targetUser: JellyfinUser, password?: string) => Promise<boolean>
  logout: () => void
  setCustomServerUrl: (url: string) => Promise<boolean>
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const getInitialServerUrl = (): string => {
  const saved = localStorage.getItem('jellyflix_server_url')
  if (saved) {
    if (saved.includes('localhost:8097')) {
      localStorage.removeItem('jellyflix_server_url')
      return ''
    }
    return saved
  }
  const envUrl = import.meta.env.VITE_JELLYFIN_URL || ''
  if (envUrl && !envUrl.includes('localhost:8097')) {
    return envUrl
  }
  return ''
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<JellyfinUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string>(getInitialServerUrl)
  const [savedUsers, setSavedUsers] = useState<JellyfinUser[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isProfileConfirmed, setIsProfileConfirmedState] = useState<boolean>(() => {
    const confirmed = localStorage.getItem('jellyflix_profile_confirmed') === 'true'
    const authTimestamp = localStorage.getItem('jellyflix_auth_timestamp')
    if (!confirmed || !authTimestamp) return false
    const age = Date.now() - parseInt(authTimestamp, 10)
    return age < AUTH_SESSION_TTL
  })

  const setProfileConfirmed = (confirmed: boolean) => {
    setIsProfileConfirmedState(confirmed)
    if (confirmed) {
      localStorage.setItem('jellyflix_profile_confirmed', 'true')
      localStorage.setItem('jellyflix_auth_timestamp', Date.now().toString())
    } else {
      localStorage.removeItem('jellyflix_profile_confirmed')
    }
  }

  // Initialize API and check connectivity/sessions
  useEffect(() => {
    jellyfinApi.setServerUrl(serverUrl)

    const initAuth = async () => {
      setIsLoading(true)
      setError(null)
      try {
        // Attempt to load stored session
        const storedToken = localStorage.getItem('jellyflix_token')
        const storedUser = localStorage.getItem('jellyflix_user')
        const authTimestamp = localStorage.getItem('jellyflix_auth_timestamp')
        const isExpired = authTimestamp ? Date.now() - parseInt(authTimestamp, 10) > AUTH_SESSION_TTL : false

        // Load cached profiles
        const cachedUsers = localStorage.getItem('jellyflix_saved_users')
        if (cachedUsers) {
          try {
            setSavedUsers(JSON.parse(cachedUsers))
          } catch {}
        }

        // Fetch public users from server if any
        try {
          const publicUsers = await jellyfinApi.getPublicUsers()
          if (publicUsers && publicUsers.length > 0) {
            setSavedUsers(publicUsers)
            localStorage.setItem('jellyflix_saved_users', JSON.stringify(publicUsers))
          }
        } catch {
          // Public users might be disabled or require auth
        }

        if (isExpired) {
          console.log('Session expired after 30 days. Re-authenticating.')
          localStorage.removeItem('jellyflix_token')
          localStorage.removeItem('jellyflix_user')
          localStorage.removeItem('jellyflix_auth_timestamp')
          localStorage.removeItem('jellyflix_profile_confirmed')
          setToken(null)
          setUser(null)
          setIsProfileConfirmedState(false)
        } else if (storedToken && storedUser) {
          const parsedUser: JellyfinUser = JSON.parse(storedUser)
          jellyfinApi.setToken(storedToken)
          setToken(storedToken)
          setUser(parsedUser)
          setIsProfileConfirmedState(true)
        }
      } catch (err: any) {
        console.warn('Initial session restore failed:', err)
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [serverUrl])

  const login = async (username: string, password = ''): Promise<boolean> => {
    setIsLoading(true)
    setError(null)
    try {
      const authRes = await jellyfinApi.authenticateByName(username, password)
      setUser(authRes.User)
      setToken(authRes.AccessToken)

      // Persist session with 30-day timestamp
      localStorage.setItem('jellyflix_token', authRes.AccessToken)
      localStorage.setItem('jellyflix_user', JSON.stringify(authRes.User))
      localStorage.setItem('jellyflix_auth_timestamp', Date.now().toString())
      localStorage.setItem('jellyflix_profile_confirmed', 'true')
      setIsProfileConfirmedState(true)

      // Update saved users list
      setSavedUsers((prev) => {
        const filtered = prev.filter((u) => u.Id !== authRes.User.Id)
        const updated = [authRes.User, ...filtered]
        localStorage.setItem('jellyflix_saved_users', JSON.stringify(updated))
        return updated
      })

      return true
    } catch (err: any) {
      console.error('Login error:', err)
      setError(err.message || 'Failed to authenticate with Jellyfin server')
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const selectProfile = async (targetUser: JellyfinUser, password = ''): Promise<boolean> => {
    return login(targetUser.Name, password)
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    setIsProfileConfirmedState(false)
    localStorage.removeItem('jellyflix_token')
    localStorage.removeItem('jellyflix_user')
    localStorage.removeItem('jellyflix_auth_timestamp')
    localStorage.removeItem('jellyflix_profile_confirmed')
    jellyfinApi.setToken(null)
  }

  const setCustomServerUrl = async (url: string): Promise<boolean> => {
    setIsLoading(true)
    setError(null)
    const cleaned = url.trim().replace(/\/$/, '')
    try {
      jellyfinApi.setServerUrl(cleaned)
      await jellyfinApi.getPublicInfo()
      setServerUrl(cleaned)
      if (cleaned) {
        localStorage.setItem('jellyflix_server_url', cleaned)
      } else {
        localStorage.removeItem('jellyflix_server_url')
      }

      // Try fetching public users on new server
      const publicUsers = await jellyfinApi.getPublicUsers().catch(() => [])
      if (publicUsers.length > 0) {
        setSavedUsers(publicUsers)
      }
      return true
    } catch (err: any) {
      setError(`Cannot connect to Jellyfin server at ${cleaned}: ${err.message}`)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const clearError = () => setError(null)

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        serverUrl,
        savedUsers,
        isLoading,
        error,
        isProfileConfirmed,
        setProfileConfirmed,
        login,
        selectProfile,
        logout,
        setCustomServerUrl,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
