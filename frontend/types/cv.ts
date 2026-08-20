/**
 * A CV rewritten by the AI against one job description.
 *
 * The document is stored and returned snake_case, exactly as the model emits
 * it, and is rendered field-by-field into the PDF the candidate downloads — so
 * unlike the interview types there is no camelCase translation at the boundary.
 * Renaming here would only mean two names for every field on the page.
 */

export interface CvContact {
  email: string | null
  phone: string | null
  location: string | null
  links: string[]
}

export interface CvExperience {
  role: string
  company: string
  location: string | null
  start_date: string | null
  end_date: string | null
  bullets: string[]
}

export interface CvEducation {
  qualification: string
  institution: string
  location: string | null
  start_date: string | null
  end_date: string | null
  details: string | null
}

export interface CvProject {
  name: string
  description: string | null
  bullets: string[]
}

export interface TailoredCvDocument {
  full_name: string
  headline: string | null
  contact: CvContact
  summary: string
  skills: string[]
  experience: CvExperience[]
  education: CvEducation[]
  projects: CvProject[]
  certifications: string[]
  /** What the AI changed and why it helps for this job. */
  tailoring_notes: string[]
  /** Job-description terms the tailored CV now genuinely evidences. */
  keywords_matched: string[]
  /** Requirements the CV does not evidence — stated rather than papered over. */
  gaps: string[]
}

export interface TailoredCv {
  id: string
  sessionId: string | null
  sourceFileName: string | null
  document: TailoredCvDocument
  tailoringNotes: string[]
  keywordsMatched: string[]
  gaps: string[]
  createdAt: string
}

// ─── Wire shapes ─────────────────────────────────────────────────────────────

export interface ApiTailoredCv {
  id: string
  session_id: string | null
  job_description_id: string | null
  source_file_name: string | null
  document: TailoredCvDocument
  tailoring_notes: string[]
  keywords_matched: string[]
  gaps: string[]
  created_at: string
}

export interface TailoredCvApiResponse {
  status: string
  /** null when the session has no tailored CV yet. */
  data: ApiTailoredCv | null
}
