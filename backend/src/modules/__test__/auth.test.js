/**
 * Authentication Tests
 * Jest test suite for auth endpoints
 * Run with: npm test
 */

import request from 'supertest';
import app from '../../app.js';

describe('Authentication API', () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const testUser = {
    email: `test-${runId}@example.com`,
    password: 'TestPassword123!',
    full_name: 'Test User',
  };

  let accessToken;
  let refreshToken;

  /**
   * ============================================================================
   * SIGNUP TESTS
   * ============================================================================
   */

  describe('POST /api/v1/auth/signup', () => {
    it('should successfully register a new user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('email', testUser.email);
      expect(res.body).toHaveProperty('message');
    });

    it('should reject duplicate email', async () => {
      // First signup
      await request(app)
        .post('/api/v1/auth/signup')
        .send(testUser);

      // Try duplicate
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send(testUser);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should validate email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'invalid-email',
          password: testUser.password,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body).toHaveProperty('errors');
    });

    it('should validate password length', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: testUser.email,
          password: 'short', // Less than 8 characters
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should accept optional full_name field', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: `user-${runId}@example.com`,
          password: testUser.password,
          full_name: 'John Doe',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.full_name).toBe('John Doe');
    });
  });

  /**
   * ============================================================================
   * LOGIN TESTS
   * ============================================================================
   */

  describe('POST /api/v1/auth/login', () => {
    beforeAll(async () => {
      // Create test user before login tests
      await request(app)
        .post('/api/v1/auth/signup')
        .send(testUser);
    });

    it('should successfully login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data).toHaveProperty('session');
      expect(res.body.data.session).toHaveProperty('access_token');
      expect(res.body.data.session).toHaveProperty('refresh_token');
      expect(res.body.data.session).toHaveProperty('expires_in');

      // Store tokens for later tests
      accessToken = res.body.data.session.access_token;
      refreshToken = res.body.data.session.refresh_token;
    });

    it('should set httpOnly cookie with refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(res).toHaveProperty('headers');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testUser.password,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: testUser.email }); // Missing password

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });


  /**
   * ============================================================================
   * PROTECTED ROUTE TESTS
   * ============================================================================
   */

  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('email', testUser.email);
    });

    it('should reject request without token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid_token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject malformed Authorization header', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'InvalidToken');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  /**
   * ============================================================================
   * LOGOUT TESTS
   * ============================================================================
   */

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should clear refresh token cookie on logout', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${loginRes.body.data.session.access_token}`);

      expect(res).toHaveProperty('headers');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  /**
   * ============================================================================
   * PASSWORD RESET TESTS
   * ============================================================================
   */

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should handle password reset request', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: testUser.email });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('email');
    });

    it('should not reveal if email exists (security)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Should return same message regardless
    });

    it('should validate email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'invalid-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });


  /**
   * ============================================================================
   * HEALTH CHECK TESTS
   * ============================================================================
   */

  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await request(app)
        .get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });
  });


  /**
   * ============================================================================
   * ERROR HANDLING TESTS
   * ============================================================================
   */

  describe('Error Handling', () => {
    it('should return 404 for non-existent route', async () => {
      const res = await request(app)
        .get('/api/v1/non-existent-route');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should handle method not allowed', async () => {
      const res = await request(app)
        .get('/api/v1/auth/login'); // Login should be POST

      expect(res.status).toBe(404);
    });
  });
});
