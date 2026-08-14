import axios, { AxiosInstance, AxiosError } from 'axios'
import Constants from 'expo-constants'
import { getAccessToken, getRefreshToken } from './token-storage'

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
    const originalRequest = error.config

    if (error.response?.status === 401 && originalRequest) {
      // Logout and auth requests should surface their original HTTP error.
      // There is no useful refresh flow when the user is signing out or has
      // no refresh token stored.
      if (originalRequest.url?.includes('/auth/logout') || originalRequest.url?.includes('/auth/login')) {
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
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

        // Note: Implement refresh token endpoint in backend if needed
        // For now, we'll treat 401 as "please log in again"
        processQueue(error, null)
        return Promise.reject(error)
      } catch (err) {
        processQueue(err, null)
        return Promise.reject(err)
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient
