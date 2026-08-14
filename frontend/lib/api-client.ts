import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import Constants from 'expo-constants'
import { clearTokens, getAccessToken, getRefreshToken, setSessionTokens } from './token-storage'
import { emitSessionExpired } from './session-events'
import type { RefreshResponse } from '@/types/api'

const DEFAULT_API_PORT = '5050'
const DEFAULT_API_PATH = '/api/v1'

const configuredUrl = process.env.EXPO_PUBLIC_API_URL

/**
 * In development the machine's LAN IP changes whenever DHCP hands out a new
 * lease (reboot, reconnect, different network), which silently breaks a
 * hard-coded EXPO_PUBLIC_API_URL and surfaces as an axios ERR_NETWORK.
 *
 * The Expo dev server host is always correct - the device is connected to it
 * right now - so derive the API host from it and reuse the port/path from
 * EXPO_PUBLIC_API_URL. Tunnel hosts (exp.direct) are skipped, since the
 * backend is not reachable through them.
 */
const resolveDevBaseUrl = (): string | null => {
  const hostUri = Constants.expoConfig?.hostUri
  const host = hostUri?.split(':')[0]
  if (!host || !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return null
  }

  let port = DEFAULT_API_PORT
  let path = DEFAULT_API_PATH
  if (configuredUrl) {
    try {
      const parsed = new URL(configuredUrl)
      port = parsed.port || port
      path = parsed.pathname.replace(/\/$/, '') || path
    } catch {
      // Malformed override - fall back to the defaults above.
    }
  }

  return `http://${host}:${port}${path}`
}

const API_BASE_URL =
  (__DEV__ ? resolveDevBaseUrl() : null) ??
  configuredUrl ??
  `http://localhost:${DEFAULT_API_PORT}${DEFAULT_API_PATH}`

console.log('API Base URL:', API_BASE_URL)

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

type RetriableRequest = InternalAxiosRequestConfig & { _retry?: boolean }

let isRefreshing = false
let failedQueue: any[] = []

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })

  isRefreshing = false
  failedQueue = []
}

/**
 * Refresh through a bare axios call rather than `apiClient`: the instance
 * interceptors would attach the expired access token and, on failure, recurse
 * straight back into this handler.
 */
const requestNewSession = async (refreshToken: string): Promise<string> => {
  const response = await axios.post<RefreshResponse>(
    `${API_BASE_URL}/auth/refresh`,
    { refresh_token: refreshToken },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  )

  const session = response.data?.data?.session
  const accessToken = session?.access_token
  const newRefreshToken = session?.refresh_token

  if (!accessToken || !newRefreshToken) {
    throw new Error('Refresh response did not include a session')
  }

  await setSessionTokens(accessToken, newRefreshToken)
  return accessToken
}

apiClient.interceptors.request.use(
  async (config) => {
    const token = await getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequest | undefined

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // Logout and auth requests should surface their original HTTP error.
      // There is no useful refresh flow when the user is signing out, signing
      // in, or when the refresh call itself is the one that failed.
      const url = originalRequest.url ?? ''
      if (
        url.includes('/auth/logout') ||
        url.includes('/auth/login') ||
        url.includes('/auth/refresh')
      ) {
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest._retry = true
          originalRequest.headers.Authorization = `Bearer ${token}`
          return apiClient(originalRequest)
        })
      }

      isRefreshing = true

      try {
        const refreshToken = await getRefreshToken()
        if (!refreshToken) {
          processQueue(error, null)
          return Promise.reject(error)
        }

        const newAccessToken = await requestNewSession(refreshToken)

        processQueue(null, newAccessToken)
        originalRequest._retry = true
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        return apiClient(originalRequest)
      } catch (err) {
        processQueue(err, null)

        // Only a rejected refresh token means the session is over. A network
        // failure here is transient, and wiping the tokens would sign the user
        // out for being briefly offline.
        const refreshStatus = axios.isAxiosError(err) ? err.response?.status : undefined
        if (!axios.isAxiosError(err) || (refreshStatus && refreshStatus !== 429 && refreshStatus < 500)) {
          await clearTokens().catch(() => {})
          emitSessionExpired()
        }

        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient
