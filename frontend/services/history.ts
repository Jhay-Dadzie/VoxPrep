import apiClient from '@/lib/api-client'
import {
  HistoryDetail,
  HistoryDetailApiResponse,
  HistoryArchiveApiResponse,
  HistoryListApiResponse,
  HistoryListResult,
  HistoryNotesApiResponse,
  HistoryQuery,
  HistoryStats,
  HistoryStatsApiResponse,
} from '@/types/history'
import { parseApiError } from './error-handler'

export const historyService = {
  async list(query: HistoryQuery = {}): Promise<HistoryListResult> {
    try {
      const search = query.search?.trim()
      const response = await apiClient.get<HistoryListApiResponse>('/history', {
        params: {
          ...(query.page ? { page: query.page } : {}),
          ...(query.limit ? { limit: query.limit } : {}),
          // The backend allows an empty search, but sending one adds a
          // pointless filter clause - leave it off instead.
          ...(search ? { search } : {}),
          ...(query.sort ? { sort: query.sort } : {}),
        },
      })

      return {
        data: response.data.data ?? [],
        pagination: response.data.pagination,
      }
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async getStats(): Promise<HistoryStats> {
    try {
      const response = await apiClient.get<HistoryStatsApiResponse>('/history/stats')
      return response.data.data
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async getById(id: string): Promise<HistoryDetail> {
    try {
      const response = await apiClient.get<HistoryDetailApiResponse>(`/history/${id}`)
      return response.data.data
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async setArchived(id: string, isArchived: boolean): Promise<boolean> {
    try {
      const response = await apiClient.patch<HistoryArchiveApiResponse>(
        `/history/${id}/archive`,
        { is_archived: isArchived }
      )
      return response.data.data.is_archived
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async updateNotes(id: string, notes: string): Promise<string | null> {
    try {
      // The endpoint is strict: `notes` must always be present, and an empty
      // string is how a client clears it.
      const response = await apiClient.patch<HistoryNotesApiResponse>(`/history/${id}/notes`, {
        notes,
      })
      return response.data.data.notes
    } catch (error) {
      throw parseApiError(error)
    }
  },

  async remove(id: string): Promise<void> {
    try {
      await apiClient.delete(`/history/${id}`)
    } catch (error) {
      throw parseApiError(error)
    }
  },
}
