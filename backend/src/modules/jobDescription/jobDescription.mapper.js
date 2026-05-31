export const mapToResponse = (job) => {
    if (!job) return null;
    
    return {
      id: job.id,
      title: job.title,
      company_name: job.company_name,
      job_content: job.job_content,
      key_skills: job.key_skills || [],
      required_experience_level: job.required_experience_level,
      industry: job.industry,
      created_at: job.created_at,
      updated_at: job.updated_at,
      is_active: job.is_active,
    };
  };
  
export const mapToListResponse = (jobs, pagination) => ({
    data: jobs.map(mapToResponse),
    pagination: pagination || {
      page: 1,
      limit: 10,
      total: jobs.length,
    },
  });
  
export default {
  mapToResponse,
  mapToListResponse,
};
