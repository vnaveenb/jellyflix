import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { JellyfinUser } from '../types/jellyfin'
import { jellyfinApi } from '../api/jellyfin'

interface AuthContextType {
  user: JellyfinUser | null
  token: string | null
  serverUrl: string
  savedUsers: JellyfinUser[]
  isLoading: boolean
  error: string | null
  login: (username: string, password?: string) => Promise<boolean>
  selectProfile: (targetUser: JellyfinUser, password?: string) => Promise<boolean>
  logout: () => void
  setCustomServerUrl: (url: string) => Promise<boolean>
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const DEFAULT_SERVER_URL = import.meta.env.VITE_JELLYFIN_URL || 'http://localhost:8097'

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<JellyfinUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string>(() => {
    return localStorage.getItem('jellyflix_server_url') || DEFAULT_SERVER_URL
  })
  const [savedUsers, setSavedUsers] = useState<JellyfinUser[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

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

        if (storedToken && storedUser) {
          const parsedUser: JellyfinUser = JSON.parse(storedUser)
          jellyfinApi.setToken(storedToken)
          setToken(storedToken)
          setUser(parsedUser)
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

      localStorage.setItem('jellyflix_token', authRes.AccessToken)
      localStorage.setItem('jellyflix_user', JSON.stringify(authRes.User))

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
    localStorage.removeItem('jellyflix_token')
    localStorage.removeItem('jellyflix_user')
    jellyfinApi.setToken(null)
  }

  const setCustomServerUrl = async (url: string): Promise<boolean> => {
    setIsLoading(true)
    setError(null)
    const cleaned = url.replace(/\/$/, '')
    try {
      jellyfinApi.setServerUrl(cleaned)
      await jellyfinApi.getPublicInfo()
      setServerUrl(cleaned)
      localStorage.setItem('jellyflix_server_url', cleaned)

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

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        serverUrl,
        savedUsers,
        isLoading,
        error,
        login,
        selectProfile,
        logout,
        setCustomServerUrl,
        clearError: () => setError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
