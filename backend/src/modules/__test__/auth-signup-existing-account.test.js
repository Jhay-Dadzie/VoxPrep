/**
 * Signup Duplicate-Account Tests
 *
 * The existing auth suite runs against the in-memory test store, which never
 * reaches the Supabase branch of authService.signup(). These tests mock the
 * Supabase clients so that branch - including Supabase's email-enumeration
 * protection - is exercised directly.
 */

import request from 'supertest';
import app from '../../app.js';

const mockListUsers = jest.fn();
const mockSignUp = jest.fn();

jest.mock('../../config/supabase.js', () => ({
  getSupabaseClient: () => ({
    auth: { signUp: mockSignUp },
    from: () => ({ insert: async () => ({ data: null, error: null }) }),
  }),
  getSupabaseAdminClient: () => ({ auth: { admin: { listUsers: mockListUsers } } }),
  getSupabaseClientForToken: () => ({}),
  initializeUserProfile: async () => ({}),
}));

// Force the Supabase code path; jest sets NODE_ENV=test, which would otherwise
// route signup through the in-memory store.
jest.mock('../../modules/auth/auth.store.js', () => ({
  shouldUseTestAuth: () => false,
  signupTestUser: jest.fn(),
  loginTestUser: jest.fn(),
  logoutTestUser: jest.fn(),
  getCurrentTestUser: jest.fn(),
  getTestGoogleOAuthUrl: jest.fn(),
  changeTestUserPassword: jest.fn(),
  requestTestPasswordReset: jest.fn(),
  verifyTestEmail: jest.fn(),
  verifyTestPasswordResetOtp: jest.fn(),
}));

const emptyPage = { data: { users: [] }, error: null };

const pageWith = (user) => ({ data: { users: [user] }, error: null });

const signupPayload = {
  email: 'existing@example.com',
  password: 'TestPassword123!',
  full_name: 'Existing User',
};

const postSignup = () => request(app).post('/api/v1/auth/signup').send(signupPayload);

beforeEach(() => {
  mockListUsers.mockReset();
  mockSignUp.mockReset();
  mockListUsers.mockResolvedValue(emptyPage);
});

describe('POST /api/v1/auth/signup - existing accounts', () => {
  it('rejects an email already registered with a password', async () => {
    mockListUsers.mockResolvedValue(
      pageWith({
        email: 'existing@example.com',
        email_confirmed_at: '2026-01-01T00:00:00Z',
        app_metadata: { provider: 'email', providers: ['email'] },
      }),
    );

    const res = await postSignup();

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe(
      'An account with this email already exists. Please sign in instead.',
    );
    expect(res.body.field).toBe('email');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('tells the user to continue with Google when the account is Google-only', async () => {
    mockListUsers.mockResolvedValue(
      pageWith({
        email: 'existing@example.com',
        email_confirmed_at: '2026-01-01T00:00:00Z',
        app_metadata: { provider: 'google', providers: ['google'] },
      }),
    );

    const res = await postSignup();

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      'This email is already registered through Google. Please continue with Google to sign in.',
    );
    expect(res.body.field).toBe('email');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('matches the existing email case-insensitively', async () => {
    mockListUsers.mockResolvedValue(
      pageWith({
        email: 'EXISTING@Example.com',
        email_confirmed_at: '2026-01-01T00:00:00Z',
        app_metadata: { provider: 'google', providers: ['google'] },
      }),
    );

    const res = await postSignup();

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Google/);
  });

  it('detects a duplicate from the decoy user when the admin lookup finds nothing', async () => {
    // Supabase's email-enumeration protection returns a user with no
    // identities instead of an error.
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'decoy', email: 'existing@example.com', identities: [] }, session: null },
      error: null,
    });

    const res = await postSignup();

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      'An account with this email already exists. Please sign in instead.',
    );
  });

  it('maps a Supabase "already registered" error to 409', async () => {
    mockSignUp.mockResolvedValue({ data: null, error: { message: 'User already registered' } });

    const res = await postSignup();

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      'An account with this email already exists. Please sign in instead.',
    );
  });

  it('resends verification for an existing but unconfirmed password account', async () => {
    mockListUsers.mockResolvedValue(
      pageWith({
        email: 'existing@example.com',
        email_confirmed_at: null,
        app_metadata: { provider: 'email', providers: ['email'] },
      }),
    );
    mockSignUp.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'existing@example.com',
          identities: [{ provider: 'email' }],
        },
        session: null,
      },
      error: null,
    });

    const res = await postSignup();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockSignUp).toHaveBeenCalled();
  });

  it('allows a genuinely new email through', async () => {
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'user-2', email: 'existing@example.com', identities: [{ provider: 'email' }] },
        session: null,
      },
      error: null,
    });

    const res = await postSignup();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('does not block signup when the admin lookup fails', async () => {
    mockListUsers.mockResolvedValue({ data: null, error: { message: 'admin API unavailable' } });
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'user-3', email: 'existing@example.com', identities: [{ provider: 'email' }] },
        session: null,
      },
      error: null,
    });

    const res = await postSignup();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
