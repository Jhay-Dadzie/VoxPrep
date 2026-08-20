import apiClient from '@/lib/api-client'
import { parseApiError } from './error-handler'
import type { ApiTailoredCv, TailoredCv, TailoredCvApiResponse } from '@/types/cv'
import type { PickedDocument } from '@/types/interview'

/**
 * Reading a whole CV and rewriting it is one long model call over the longest
 * input in the product — the CV plus the job description — so it needs far more
 * than the client's default 15s ceiling.
 */
const TAILOR_TIMEOUT_MS = 180_000

const toTailoredCv = (cv: ApiTailoredCv): TailoredCv => ({
  id: cv.id,
  sessionId: cv.session_id,
  sourceFileName: cv.source_file_name,
  document: cv.document,
  tailoringNotes: cv.tailoring_notes ?? [],
  keywordsMatched: cv.keywords_matched ?? [],
  gaps: cv.gaps ?? [],
  createdAt: cv.created_at,
})

export const cvService = {
  /**
   * Upload a CV and get it rewritten for this session's job description.
   *
   * Always multipart: there is no paste path here. A CV is a formatted document
   * the candidate already has, and asking them to retype it on a phone after an
   * interview they have just finished is not a flow anyone would use.
   */
  async tailor(sessionId: string, document: PickedDocument): Promise<TailoredCv> {
    try {
      const form = new FormData()
      // React Native's FormData takes this {uri,name,type} shape rather than a Blob.
      form.append('cv', {
        uri: document.uri,
        name: document.name,
        type: document.mimeType,
      } as any)

      // The request interceptor strips the JSON content-type for FormData
      // bodies so the platform can set the multipart boundary itself.
      const response = await apiClient.post<{ status: string; data: ApiTailoredCv }>(
        `/cv/sessions/${sessionId}/tailor`,
        form,
        { timeout: TAILOR_TIMEOUT_MS }
      )

      return toTailoredCv(response.data.data)
    } catch (error) {
      throw parseApiError(error)
    }
  },

  /**
   * The tailored CV already made for this session, if there is one.
   *
   * Lets a candidate who comes back to the screen — or who leaves before
   * downloading — pick up the CV they already paid a model call for, instead of
   * uploading again.
   */
  async getForSession(sessionId: string): Promise<TailoredCv | null> {
    try {
      const response = await apiClient.get<TailoredCvApiResponse>(`/cv/sessions/${sessionId}`)
      const data = response.data.data
      return data ? toTailoredCv(data) : null
    } catch (error) {
      throw parseApiError(error)
    }
  },
}
