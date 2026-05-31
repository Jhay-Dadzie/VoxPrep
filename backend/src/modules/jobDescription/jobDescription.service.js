// Import Supabase admin client factory
import { getSupabaseAdminClient } from '../../config/supabase.js';

// Import helper functions used to analyze job descriptions
import {
  extractSkills,
  detectExperienceLevel,
  detectIndustry,
} from '../../core/utils/helpers.js';

// Cached Supabase instance
let supabase;

/**
 * Returns a singleton Supabase admin client.
 * Prevents creating a new client every time a service function is called.
 */
const getSupabase = () => {
  if (!supabase) {
    supabase = getSupabaseAdminClient();
  }

  return supabase;
};

/**
 * Create a new job description.
 *
 * Steps:
 * 1. Extract skills from the job content.
 * 2. Detect experience level if not provided.
 * 3. Detect industry if not provided.
 * 4. Insert record into database.
 */
export const createJobDescription = async (jobData) => {
  const {
    title,
    company_name,
    job_content,
    required_experience_level,
    industry,
    user_id,
  } = jobData;

  const supabase = getSupabase();

  // Automatically derive metadata from job content
  const skills = extractSkills(job_content);
  const expLevel =
    required_experience_level || detectExperienceLevel(job_content);
  const detectedIndustry =
    industry || detectIndustry(job_content);

  // Insert new job description
  const { data, error } = await supabase
    .from('job_descriptions')
    .insert({
      user_id,
      title,
      company_name,
      job_content,
      key_skills: skills,
      required_experience_level: expLevel,
      industry: detectedIndustry,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data;
};

/**
 * Get paginated list of job descriptions belonging to a user.
 *
 * Supports:
 * - Pagination
 * - Search
 * - Sorting by latest created
 */
export const getJobDescriptions = async (
  userId,
  options = {}
) => {
  const { page = 1, limit = 10, search } = options;

  // Calculate pagination range
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = getSupabase();

  // Base query
  let query = supabase
    .from('job_descriptions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  // Apply search filter if provided
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,company_name.ilike.%${search}%,job_content.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query.range(from, to);

  if (error) throw new Error(error.message);

  return {
    data: data || [],
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
};

/**
 * Retrieve a single job description by ID.
 *
 * Security:
 * - Must belong to the requesting user.
 * - Must be active.
 */
export const getJobDescriptionById = async (
  id,
  userId
) => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('job_descriptions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  // Return null if not found
  if (error) return null;

  return data;
};

/**
 * Update an existing job description.
 *
 * Features:
 * - Supports partial updates.
 * - Recalculates skills, experience level,
 *   and industry when job content changes.
 */
export const updateJobDescription = async (
  id,
  userId,
  updateData
) => {
  const {
    title,
    company_name,
    job_content,
    required_experience_level,
    industry,
  } = updateData;

  // Always update timestamp
  const updatePayload = {
    updated_at: new Date().toISOString(),
  };

  // Add provided fields only
  if (title !== undefined)
    updatePayload.title = title;

  if (company_name !== undefined)
    updatePayload.company_name = company_name;

  // If job content changes,
  // regenerate metadata automatically
  if (job_content) {
    updatePayload.job_content = job_content;
    updatePayload.key_skills =
      extractSkills(job_content);

    updatePayload.required_experience_level =
      required_experience_level ||
      detectExperienceLevel(job_content);

    updatePayload.industry =
      industry || detectIndustry(job_content);
  } else {
    // Update metadata independently if supplied
    if (required_experience_level !== undefined) {
      updatePayload.required_experience_level =
        required_experience_level;
    }

    if (industry !== undefined) {
      updatePayload.industry = industry;
    }
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('job_descriptions')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
};

/**
 * Soft delete a job description.
 *
 * Instead of removing the record,
 * mark it as inactive.
 *
 * Benefits:
 * - Data recovery possible
 * - Maintains historical records
 */
export const deleteJobDescription = async (
  id,
  userId
) => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('job_descriptions')
    .update({
      is_active: false,
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);

  return Boolean(data);
};

/**
 * Export service functions
 * for use in controllers.
 */
export default {
  createJobDescription,
  getJobDescriptions,
  getJobDescriptionById,
  updateJobDescription,
  deleteJobDescription,
};