/**
 * Session refresh tests
 * Covers POST /api/v1/auth/refresh - the endpoint that keeps a signed-in user
 * signed in once their short-lived access token expires.
 */

import request from 'supertest';
import app from '../../app.js';

const isEmailVerificationEnabled = process.env.SUPABASE_EMAIL_CONFIRMATION === 'true';
const describeIfSessions = isEmailVerificationEnabled ? describe.skip : describe;

describeIfSessions('POST /api/v1/auth/refresh', () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const testUser = {
    email: `refresh-${runId}@example.com`,
    password: 'TestPassword123!',
    full_name: 'Refresh User',
  };

  let accessToken;
  let refreshToken;

  beforeAll(async () => {
    await request(app).post('/api/v1/auth/signup').send(testUser);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    accessToken = res.body.data?.session?.access_token;
    refreshToken = res.body.data?.session?.refresh_token;
  });

  it('returns a new session for a valid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.session).toHaveProperty('access_token');
    expect(res.body.data.session).toHaveProperty('refresh_token');
    expect(res.body.data.user).toHaveProperty('email', testUser.email);
  });

  it('issues a token that is accepted by protected routes', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: login.body.data.session.refresh_token });

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.data.session.access_token}`);

    expect(me.status).toBe(200);
    expect(me.body.data).toHaveProperty('email', testUser.email);
  });

  it('does not require a valid access token', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Authorization', 'Bearer expired-or-garbage-token')
      .send({ refresh_token: login.body.data.session.refresh_token });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects a request with no refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({});

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects an invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: 'not-a-real-refresh-token' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('invalidates the session after logout', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${login.body.data.session.access_token}`);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: login.body.data.session.refresh_token });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
