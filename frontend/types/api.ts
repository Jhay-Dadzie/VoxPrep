export interface SignupRequest {
  email: string
  password: string
  full_name?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface AuthResponse {
  success: boolean
  message: string
  data?: {
    user?: {
      id: string
      email: string
      full_name: string | null
      is_active: boolean
      profile_completed: boolean
      created_at: string
      updated_at: string
    } | null
    session?: {
      access_token: string
      refresh_token: string
    } | null
    // Kept optional for compatibility with older backend responses.
    access_token?: string
    refresh_token?: string
  }
}

export interface CurrentUserResponse {
  success: boolean
  data: {
    id: string
    email: string
    full_name: string | null
    is_active: boolean
    profile_completed: boolean
    created_at: string
    updated_at: string
  }
}

export interface UpdateProfileRequest {
  full_name?: string
}

export interface UpdateProfileResponse {
  success: boolean
  data: {
    id: string
    email: string
    full_name: string | null
    is_active: boolean
    profile_completed: boolean
    created_at: string
    updated_at: string
  }
}

export interface UpdateStatusRequest {
  is_active: boolean
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ForgotPasswordResponse {
  success: boolean
  message: string
}

export interface ResendVerificationRequest {
  email: string
}

export interface ResetPasswordRequest {
  email?: string
  token?: string
  token_hash?: string
  code?: string
  access_token?: string
  refresh_token?: string
  password: string
}

export interface ResetPasswordResponse {
  success: boolean
  message: string
}

export interface PasswordResetOtpResponse {
  success: boolean
  message: string
  data: {
    access_token: string
    refresh_token: string
  }
}

export interface VerifyEmailResponse {
  success: boolean
  message: string
}

export interface ApiError {
  success: false
  message: string
  field?: string
  details?: Record<string, string>
}
