import axios, { AxiosInstance, AxiosError } from 'axios'
import { getAccessToken, getRefreshToken } from './token-storage'

// Debug: Log the API URL
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5050/api/v1'
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
