import apiClient from '@/lib/api-client'
import { updateStoredUser, StoredUser } from '@/lib/token-storage'
import { UpdateProfileRequest, UpdateProfileResponse, UpdateStatusRequest, CurrentUserResponse } from '@/types/api'
import { parseApiError } from './error-handler'

export const userService = {
  async getProfile(): Promise<StoredUser> {
    try {
      const response = await apiClient.get<CurrentUserResponse>('/users/me')
      return response.data.data
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async updateProfile(data: UpdateProfileRequest): Promise<StoredUser> {
    try {
      const response = await apiClient.patch<UpdateProfileResponse>('/users/me', data)
      await updateStoredUser(response.data.data)
      return response.data.data
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async updateStatus(isActive: boolean): Promise<StoredUser> {
    try {
      const response = await apiClient.patch<UpdateProfileResponse>('/users/me/status', {
        is_active: isActive,
      })
      await updateStoredUser(response.data.data)
      return response.data.data
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async completeProfile(): Promise<StoredUser> {
    try {
      const response = await apiClient.patch<UpdateProfileResponse>('/users/me/complete-profile', {})
      await updateStoredUser(response.data.data)
      return response.data.data
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async deleteAccount(): Promise<void> {
    try {
      await apiClient.delete('/users/me')
    } catch (error) {
      throw parseApiError(error)
    }
  },
}
