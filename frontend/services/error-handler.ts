import { AxiosError } from 'axios'
import { ApiError } from '@/types/api'

export class AuthError extends Error {
  constructor(
    public message: string,
    public field?: string,
    public details?: Record<string, string>
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export class NetworkError extends Error {
  constructor(message: string = 'Network error. Please check your connection.') {
    super(message)
    this.name = 'NetworkError'
  }
}

export const parseApiError = (error: unknown): AuthError => {
  console.error('Raw error:', error)

  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiError | undefined

    console.error('AxiosError details:', {
      status: error.response?.status,
      url: error.config?.url,
      method: error.config?.method,
      message: error.message,
      code: error.code,
      responseData: data,
    })

    if (data?.message) {
      return new AuthError(data.message, data.field, data.details ?? data.errors)
    }

    if (error.response?.status === 401) {
      return new AuthError('Invalid email or password')
    }

    if (error.response?.status === 409) {
      return new AuthError('Email already registered')
    }

    if (error.response?.status === 404) {
      return new AuthError('User not found')
    }

    if (error.response?.status >= 500) {
      return new AuthError('Server error. Please try again later.')
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND' || error.code === 'ERR_NETWORK') {
      console.error('Network error detected:', error.code)
      return new NetworkError()
    }

    // Generic network error if no response
    if (!error.response) {
      console.error('No response - possible CORS or connection issue')
      return new NetworkError(`Network error: ${error.message}`)
    }
  }

  if (error instanceof Error) {
    console.error('Generic error:', error.message)
    return new AuthError(error.message)
  }

  console.error('Unknown error type:', error)
  return new AuthError('An unexpected error occurred')
}

export const getFieldError = (error: AuthError | null | undefined, field: string): string | undefined => {
  if (!error) return undefined
  if (error.field === field) {
    return error.message
  }
  return error.details?.[field]
}
