import AsyncStorage from '@react-native-async-storage/async-storage'

const ACCESS_TOKEN_KEY = 'voxprep.access_token'
const REFRESH_TOKEN_KEY = 'voxprep.refresh_token'
const USER_KEY = 'voxprep.user'

export interface StoredUser {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  profile_completed: boolean
  created_at: string
  updated_at: string
}

export const setTokens = async (accessToken: string, refreshToken: string, user: StoredUser) => {
  if (!accessToken || !refreshToken) {
    throw new Error('Cannot store authentication tokens: the server returned an incomplete session')
  }

  try {
    await Promise.all([
      AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken),
      AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
    ])
  } catch (error) {
    console.error('Failed to store tokens:', error)
    throw error
  }
}

/**
 * Replace the session tokens after a refresh, leaving the stored user intact.
 */
export const setSessionTokens = async (accessToken: string, refreshToken: string) => {
  if (!accessToken || !refreshToken) {
    throw new Error('Cannot store authentication tokens: the server returned an incomplete session')
  }

  await Promise.all([
    AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken),
    AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken),
  ])
}

export const getAccessToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(ACCESS_TOKEN_KEY)
  } catch (error) {
    console.error('Failed to get access token:', error)
    return null
  }
}

export const getRefreshToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(REFRESH_TOKEN_KEY)
  } catch (error) {
    console.error('Failed to get refresh token:', error)
    return null
  }
}

export const getStoredUser = async (): Promise<StoredUser | null> => {
  try {
    const user = await AsyncStorage.getItem(USER_KEY)
    return user ? JSON.parse(user) : null
  } catch (error) {
    console.error('Failed to get stored user:', error)
    return null
  }
}

export const clearTokens = async () => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
      AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
    ])
  } catch (error) {
    console.error('Failed to clear tokens:', error)
    throw error
  }
}

export const updateStoredUser = async (user: Partial<StoredUser>) => {
  try {
    const existingUser = await getStoredUser()
    if (existingUser) {
      const updatedUser = { ...existingUser, ...user }
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser))
    }
  } catch (error) {
    console.error('Failed to update stored user:', error)
    throw error
  }
}
