import Constants from 'expo-constants'
import { Platform } from 'react-native'

/**
 * Where the backend lives.
 *
 * "localhost" is the phone itself, not the development machine, so a real
 * device cannot use it. Expo already knows the machine's LAN address — it is
 * how the bundle got to the phone — so derive the API host from that and the
 * same address works on device, simulator, and web with no manual edits.
 *
 * Set EXPO_PUBLIC_API_URL to override, which is what a deployed build will do.
 */

const BACKEND_PORT = 5050

function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL
  if (explicit) return explicit.replace(/\/$/, '')

  // e.g. "192.168.1.42:8081" while running in Expo Go or a dev build.
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost
  const host = hostUri?.split(':')[0]

  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${BACKEND_PORT}`
  }

  // Android emulators reach the host machine through this alias, never localhost.
  if (Platform.OS === 'android') return `http://10.0.2.2:${BACKEND_PORT}`

  return `http://localhost:${BACKEND_PORT}`
}

export const API_BASE_URL = resolveBaseUrl()
