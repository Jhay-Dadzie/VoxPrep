import { randomUUID } from 'node:crypto';

const isTestMode = process.env.NODE_ENV === 'test';
const isEmailConfirmationEnabled = process.env.SUPABASE_EMAIL_CONFIRMATION === 'true';

const usersByEmail = new Map();
const usersById = new Map();
const sessionsByAccessToken = new Map();
const sessionsByRefreshToken = new Map();
const verificationTokensByValue = new Map();

function createSession(userId) {
  const access_token = `test-access.${randomUUID()}`;
  const refresh_token = `test-refresh.${randomUUID()}`;
  const expires_in = 60 * 60;
  const expires_at = Math.floor(Date.now() / 1000) + expires_in;
  const token_type = 'bearer';

  const session = {
    access_token,
    refresh_token,
    expires_in,
    expires_at,
    token_type,
  };

  sessionsByAccessToken.set(access_token, { userId, refresh_token });
  sessionsByRefreshToken.set(refresh_token, { userId, access_token });

  return session;
}

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name ?? null,
  };
}

export function shouldUseTestAuth() {
  return isTestMode;
}

export function signupTestUser({ email, password, full_name }) {
  const normalizedEmail = email.toLowerCase();

  if (usersByEmail.has(normalizedEmail)) {
    throw new Error('User already registered');
  }

  const user = {
    id: randomUUID(),
    email: normalizedEmail,
    password,
    full_name: full_name || null,
    email_confirmed: !isEmailConfirmationEnabled,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  usersByEmail.set(normalizedEmail, user);
  usersById.set(user.id, user);

  if (isEmailConfirmationEnabled) {
    const verificationToken = `verify.${randomUUID()}`;
    verificationTokensByValue.set(verificationToken, user.id);
    return {
      user: toPublicUser(user),
      session: null,
      message: 'Verification email sent. Please confirm your email address.',
    };
  }

  const session = createSession(user.id);

  return {
    user: toPublicUser(user),
    session,
    message: 'Signup successful',
  };
}

export function loginTestUser({ email, password }) {
  const user = usersByEmail.get(email.toLowerCase());

  if (!user || user.password !== password) {
    throw new Error('Invalid login credentials');
  }

  if (!user.email_confirmed) {
    throw new Error('Please verify your email address before logging in.');
  }

  const session = createSession(user.id);

  return {
    user: toPublicUser(user),
    session,
  };
}

export function getCurrentTestUser(accessToken) {
  const session = sessionsByAccessToken.get(accessToken);

  if (!session) {
    throw new Error('Invalid or expired token');
  }

  const user = usersById.get(session.userId);

  if (!user) {
    throw new Error('Invalid or expired token');
  }

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    created_at: user.created_at,
  };
}

export function logoutTestUser(accessToken) {
  const session = sessionsByAccessToken.get(accessToken);

  if (!session) {
    throw new Error('Invalid or expired token');
  }

  sessionsByAccessToken.delete(accessToken);
  sessionsByRefreshToken.delete(session.refresh_token);

  return { message: 'Logout successful' };
}

export function verifyTestEmail(token) {
  const userId = verificationTokensByValue.get(token);

  if (!userId) {
    throw new Error('Invalid or expired verification token');
  }

  const user = usersById.get(userId);

  if (!user) {
    throw new Error('Invalid or expired verification token');
  }

  user.email_confirmed = true;
  user.updated_at = new Date().toISOString();
  verificationTokensByValue.delete(token);

  return { message: 'Email verified successfully' };
}

export function getTestGoogleOAuthUrl(redirectTo) {
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=test&redirect_uri=${encodeURIComponent(redirectTo)}&response_type=code&scope=openid%20email%20profile`;
}
