import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import apiClient from '@/lib/api-client'
import { setTokens, clearTokens, StoredUser } from '@/lib/token-storage'
import {
  SignupRequest,
  LoginRequest,
  AuthResponse,
  CurrentUserResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  PasswordResetOtpResponse,
} from '@/types/api'
import { parseApiError } from './error-handler'

WebBrowser.maybeCompleteAuthSession()

type AuthData = NonNullable<AuthResponse['data']>

export type SignupResult = {
  user: StoredUser | null
  requiresVerification: boolean
}

const storeAuthData = async (data: AuthData, operation: 'signup' | 'login'): Promise<StoredUser> => {
  const accessToken = data.session?.access_token ?? data.access_token
  const refreshToken = data.session?.refresh_token ?? data.refresh_token

  if (!data.user || !accessToken || !refreshToken) {
    throw new Error(`Invalid response from ${operation}: missing user or session tokens`)
  }

  await setTokens(accessToken, refreshToken, data.user)
  return data.user
}

const getAuthUser = (data: AuthData, operation: 'signup' | 'login'): StoredUser => {
  if (!data.user) {
    throw new Error(`Invalid response from ${operation}: missing user`)
  }

  return data.user
}

export const authService = {
  async signup(data: SignupRequest): Promise<SignupResult> {
    try {
      console.log('Signup request:', { email: data.email })
      const fullName = data.full_name?.trim()
      const payload: SignupRequest = {
        email: data.email.trim(),
        password: data.password,
        ...(fullName ? { full_name: fullName } : {}),
      }
      const response = await apiClient.post<AuthResponse>('/auth/signup', payload)

      if (response.data.data) {
        const authData = response.data.data
        const hasSession = Boolean(authData.session?.access_token || authData.access_token)

        if (!hasSession) {
          return {
            user: authData.user ? getAuthUser(authData, 'signup') : null,
            requiresVerification: true,
          }
        }

        await storeAuthData(authData, 'signup')
        return { user: getAuthUser(authData, 'signup'), requiresVerification: false }
      }

      throw new Error('Invalid response from signup')
    } catch (error) {
      console.error('Signup error:', error)
      throw parseApiError(error)
    }
  },

  async login(data: LoginRequest): Promise<StoredUser> {
    try {
      console.log('Login request:', { email: data.email })
      const response = await apiClient.post<AuthResponse>('/auth/login', data)

      if (response.data.data) {
        return await storeAuthData(response.data.data, 'login')
      }

      throw new Error('Invalid response from login')
    } catch (error) {
      console.error('Login error:', error)
      throw parseApiError(error)
    }
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout')
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      await clearTokens()
    }
  },

  async getCurrentUser(): Promise<StoredUser> {
    try {
      const response = await apiClient.get<CurrentUserResponse>('/auth/me')
      return response.data.data
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async forgotPassword(data: ForgotPasswordRequest): Promise<void> {
    try {
      await apiClient.post('/auth/forgot-password', data)
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async verifyPasswordResetOtp(email: string, token: string): Promise<PasswordResetOtpResponse['data']> {
    try {
      const response = await apiClient.post<PasswordResetOtpResponse>('/auth/verify-password-reset-otp', {
        email,
        token,
      })
      return response.data.data
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async resetPassword(data: ResetPasswordRequest): Promise<void> {
    try {
      await apiClient.post('/auth/reset-password', data)
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async verifyEmail(email: string, token: string): Promise<void> {
    try {
      await apiClient.get('/auth/verify-email', { params: { email, token } })
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async changePassword(data: { current_password: string; new_password: string }): Promise<void> {
    try {
      await apiClient.post('/auth/change-password', data)
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async resendVerification(email: string): Promise<void> {
    try {
      await apiClient.post('/auth/resend-verification', { email })
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async googleSignIn(): Promise<StoredUser> {
    try {
      // Return from Google directly to the app instead of the backend's
      // localhost callback URL.
      const redirectUrl = Linking.createURL('oauth-callback')
      const response = await apiClient.get<any>('/auth/google', {
        params: { redirectUri: redirectUrl },
      })
      const oauthUrl = response.data.data?.url ?? response.data.url

      if (!oauthUrl) {
        throw new Error('No OAuth URL returned from server')
      }

      const result = await WebBrowser.openAuthSessionAsync(oauthUrl, redirectUrl)

      if (result.type === 'dismiss') {
        throw new Error('Google signin was cancelled')
      }

      if (result.type === 'success' && result.url) {
        const parsedUrl = new URL(result.url)
        const code = parsedUrl.searchParams.get('code')

        if (!code) {
          throw new Error('No authorization code in callback')
        }

        const callbackResponse = await apiClient.get<AuthResponse>('/auth/google/callback', {
          params: { code }
        })

        if (callbackResponse.data.data) {
          return await storeAuthData(callbackResponse.data.data, 'login')
        }
      }

      throw new Error('Google signin failed')
    } catch (error) {
      console.error('Google signin error:', error)
      throw parseApiError(error)
    }
  },
}
