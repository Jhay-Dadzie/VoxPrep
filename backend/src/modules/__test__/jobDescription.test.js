import request from 'supertest';
import express, { json } from 'express';

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SECRET_KEY = 'test-secret';

const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  single: jest.fn(),
  maybeSingle: jest.fn(),
  range: jest.fn(),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

jest.mock('../auth/auth.middleware.js', () => ({
  protect: (req, res, next) => {
    req.user = { id: 'test-user-id' };
    next();
  },
}));

jest.mock('../../core/middleware/upload.middleware.js', () => ({
  uploadJobDocument: (req, res, next) => next(),
}));

let app;

beforeAll(async () => {
  const { default: jobDescriptionRoutes } = await import('../jobDescription/jobDescription.routes.js');
  app = express();
  app.use(json());
  app.use('/api/v1/job-descriptions', jobDescriptionRoutes);
});

describe('Job Description Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/job-descriptions', () => {
    it('should create a new job description with text input', async () => {
      const jobData = {
        title: 'Senior Software Engineer',
        company_name: 'Tech Corp',
        job_content: 'We are looking for a senior developer with React and Node.js experience...',
        required_experience_level: 'senior',
      };

      mockSupabase.single.mockResolvedValue({
        data: { id: 'job-123', ...jobData, user_id: 'test-user-id', key_skills: ['react', 'node'] },
        error: null,
      });

      const res = await request(app)
        .post('/api/v1/job-descriptions')
        .send(jobData);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.title).toBe(jobData.title);
      expect(res.body.data.key_skills).toBeDefined();
    });

    it('should return 400 if job content is missing', async () => {
      const res = await request(app)
        .post('/api/v1/job-descriptions')
        .send({ title: 'Test Job' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/job-descriptions', () => {
    it('should return list of user job descriptions', async () => {
      const mockJobs = [
        { id: '1', title: 'Job 1', user_id: 'test-user-id' },
        { id: '2', title: 'Job 2', user_id: 'test-user-id' },
      ];

      mockSupabase.range.mockResolvedValue({
        data: mockJobs,
        count: 2,
        error: null,
      });

      const res = await request(app)
        .get('/api/v1/job-descriptions?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination).toBeDefined();
    });
  });

  describe('GET /api/v1/job-descriptions/:id', () => {
    it('should return a single job description', async () => {
      const mockJob = {
        id: 'job-123',
        title: 'Senior Engineer',
        user_id: 'test-user-id',
        job_content: 'Sample content',
      };

      mockSupabase.single.mockResolvedValue({
        data: mockJob,
        error: null,
      });

      const res = await request(app)
        .get('/api/v1/job-descriptions/job-123');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('job-123');
    });

    it('should return 404 if job not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      const res = await request(app)
        .get('/api/v1/job-descriptions/invalid-id');

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/job-descriptions/:id', () => {
    it('should update a job description', async () => {
      const updateData = { title: 'Updated Senior Engineer Title' };

      mockSupabase.maybeSingle.mockResolvedValue({
        data: { id: 'job-123', ...updateData },
        error: null,
      });

      const res = await request(app)
        .put('/api/v1/job-descriptions/job-123')
        .send(updateData);

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe(updateData.title);
    });
  });

  describe('DELETE /api/v1/job-descriptions/:id', () => {
    it('should soft delete a job description', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { id: 'job-123' },
        error: null,
      });

      const res = await request(app)
        .delete('/api/v1/job-descriptions/job-123');

      expect(res.status).toBe(204);
    });
  });
});
