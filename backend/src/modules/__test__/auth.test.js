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

  // Helper to conditionally skip tests if email verification is enabled
  const isEmailVerificationEnabled = process.env.SUPABASE_EMAIL_CONFIRMATION === 'true';

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
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data.user).toHaveProperty('email', testUser.email);

      if (!isEmailVerificationEnabled) {
        expect(res.body.data).toHaveProperty('session');
        expect(res.body.data.session).toHaveProperty('access_token');
      } else {
        expect(res.body.data.session).toBeNull();
      }
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
      const uniqueEmail = `user-${runId}@example.com`;
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: uniqueEmail,
          password: testUser.password,
          full_name: 'John Doe',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.full_name).toBe('John Doe');
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

    it('should successfully login with correct credentials (if email verified)', async () => {
      if (isEmailVerificationEnabled) {
        console.warn('Skipping login test because email verification is enabled. User must verify email first.');
        return;
      }

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

      accessToken = res.body.data.session.access_token;
      refreshToken = res.body.data.session.refresh_token;
    });

    it('should set httpOnly cookie with refresh token', async () => {
      if (isEmailVerificationEnabled) return;

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
   * GOOGLE OAUTH TESTS
   * ============================================================================
   */

  describe('GET /api/v1/auth/google', () => {
    it('should return a Google OAuth URL', async () => {
      const res = await request(app)
        .get('/api/v1/auth/google');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.url).toBeDefined();
      expect(res.body.url).toMatch(/accounts\.google\.com/);
    });
  });

  describe('GET /api/v1/auth/google/callback', () => {
    it('should return 400 if code is missing', async () => {
      const res = await request(app)
        .get('/api/v1/auth/google/callback');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/missing/i);
    });
  });

  /**
   * ============================================================================
   * EMAIL VERIFICATION TEST
   * ============================================================================
   */

  describe('GET /api/v1/auth/verify-email', () => {
    it('should return 400 if token is missing', async () => {
      const res = await request(app)
        .get('/api/v1/auth/verify-email');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/token missing/i);
    });

    // Note: Testing with a real token requires a seeded email verification flow.
    // This test is skipped in normal test runs.
    it.skip('should verify email with valid token', async () => {
      const fakeToken = 'valid-test-token';
      const res = await request(app)
        .get(`/api/v1/auth/verify-email?token=${fakeToken}`);

      // In a real environment, Supabase would validate the token.
      // For testing, you may need to mock the authService.verifyEmail method.
      expect([200, 400]).toContain(res.status);
    });
  });

  /**
   * ============================================================================
   * PROTECTED ROUTE TESTS
   * ============================================================================
   */

  describe('GET /api/v1/auth/me', () => {
    beforeAll(async () => {
      if (!accessToken && !isEmailVerificationEnabled) {
        // Obtain a valid token if not already available
        const loginRes = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password,
          });
        if (loginRes.status === 200) {
          accessToken = loginRes.body.data.session.access_token;
        }
      }
    });

    it('should return current user with valid token', async () => {
      if (!accessToken) {
        console.warn('Skipping /me test: no valid access token available');
        return;
      }

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
      if (!accessToken) {
        console.warn('Skipping logout test: no valid access token');
        return;
      }

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should clear refresh token cookie on logout', async () => {
      if (isEmailVerificationEnabled) return;

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      if (loginRes.status !== 200) return;

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

  describe('POST /api/v1/auth/reset-password', () => {
    it('should reset a password with a recovery access token', async () => {
      if (isEmailVerificationEnabled) return;

      const newPassword = 'UpdatedPassword123!';
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(loginRes.status).toBe(200);

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          access_token: loginRes.body.data.session.access_token,
          password: newPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const oldPasswordRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(oldPasswordRes.status).toBe(401);

      const newPasswordRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: newPassword,
        });

      expect(newPasswordRes.status).toBe(200);
      expect(newPasswordRes.body.success).toBe(true);

      testUser.password = newPassword;
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