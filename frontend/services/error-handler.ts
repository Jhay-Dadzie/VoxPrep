import { AxiosError, isAxiosError } from 'axios'
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

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.'

const asMessage = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const firstMessage = value.find((item) => typeof item === 'string' && item.trim())
    return typeof firstMessage === 'string' ? firstMessage.trim() : undefined
  }
  return undefined
}

const asDetails = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const details = Object.entries(value).reduce<Record<string, string>>((result, [key, detail]) => {
    const message = asMessage(detail)
    if (message) result[key] = message
    return result
  }, {})

  return Object.keys(details).length ? details : undefined
}

const isTechnicalMessage = (message: string) =>
  /^(request failed with status code|network error$|timeout of .* exceeded$|invalid response from|no oauth url returned|no (session or )?authorization code in callback|google signin failed|cannot store authentication tokens)/i.test(message)

export const parseApiError = (error: unknown): AuthError => {
  console.error('Raw error:', error)

  if (isAxiosError(error) || error instanceof AxiosError) {
    const axiosError = error as AxiosError
    const data = axiosError.response?.data as ApiError | undefined
    const details = asDetails(data?.details ?? data?.errors)
    let message = asMessage(data?.message)

    if (message === 'Validation failed' && details) {
      message = Object.values(details)[0]
    }

    console.error('AxiosError details:', {
      status: axiosError.response?.status,
      url: axiosError.config?.url,
      method: axiosError.config?.method,
      message: axiosError.message,
      code: axiosError.code,
      responseData: data,
    })

    if (message && !isTechnicalMessage(message)) {
      return new AuthError(message, data?.field, details)
    }

    if (axiosError.response?.status === 401) {
      return new AuthError('Invalid email or password', data?.field, details)
    }

    if (axiosError.response?.status === 409) {
      return new AuthError('Email already registered', data?.field, details)
    }

    if (axiosError.response?.status === 404) {
      return new AuthError('User not found', data?.field, details)
    }

    if (axiosError.response?.status === 429) {
      return new AuthError('Too many attempts. Please wait a moment and try again.')
    }

    if (axiosError.response?.status && axiosError.response.status >= 500) {
      return new AuthError('Server error. Please try again later.')
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ENOTFOUND' || axiosError.code === 'ERR_NETWORK' || !axiosError.response) {
      console.error('No response - possible CORS or connection issue')
      return new AuthError('Network error. Please check your connection and try again.')
    }

    return new AuthError(FALLBACK_MESSAGE, data?.field, details)
  }

  if (error instanceof NetworkError) {
    return new AuthError(error.message)
  }

  if (error instanceof Error) {
    console.error('Generic error:', error.message)
    return new AuthError(isTechnicalMessage(error.message) ? FALLBACK_MESSAGE : error.message)
  }

  console.error('Unknown error type:', error)
  return new AuthError(FALLBACK_MESSAGE)
}

export const toAuthError = (error: unknown): AuthError =>
  error instanceof AuthError ? error : parseApiError(error)

export const getFieldError = (error: AuthError | null | undefined, field: string): string | undefined => {
  if (!error) return undefined
  if (error.field === field) {
    return error.message
  }
  return error.details?.[field]
}
