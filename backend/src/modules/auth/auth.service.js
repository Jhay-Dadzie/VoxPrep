/**
 * Simplified Authentication Service
 * Optimized for: Email/Password only, basic login/signup/password-reset
 */

import {
  getSupabaseAdminClient,
  getSupabaseClient,
  getSupabaseClientForToken,
  initializeUserProfile,
} from '../../config/supabase.js';
import { AppError } from '../../core/errors/appError.js';
import { error as _error, info, warn } from '../../core/errors/logger.js';
import {
  getCurrentTestUser,
  getTestGoogleOAuthUrl,
  loginTestUser,
  changeTestUserPassword,
  logoutTestUser,
  refreshTestSession,
  requestTestPasswordReset,
  shouldUseTestAuth,
  signupTestUser,
  verifyTestEmail,
  verifyTestPasswordResetOtp,
} from './auth.store.js';

function getBaseUrl(envKey, fallbackPort) {
  const value = process.env[envKey]?.trim();
  if (value) {
    return value.replace(/\/+$/, '');
  }

  return `http://localhost:${process.env.PORT || fallbackPort}`;
}

function validateOAuthRedirectUri(redirectUri) {
  if (!redirectUri) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new Error('Invalid OAuth redirect URI');
  }

  // Only app deep links are accepted. This prevents the OAuth endpoint from
  // becoming an arbitrary redirector for authorization codes.
  if (!['frontend:', 'exp:'].includes(parsed.protocol)) {
    throw new Error('Unsupported OAuth redirect URI');
  }

  return redirectUri;
}

function generateRandomAvatarUrl(email, fullName) {
  const name = encodeURIComponent(fullName || email.split('@')[0] || 'user');
  // UI Avatars – free, consistent, no API key
  return `https://ui-avatars.com/api/?name=${name}&background=random&size=128&bold=true`;
}

const EXISTING_ACCOUNT_SIGNUP_MESSAGE =
  'An account with this email already exists. Please sign in instead.';
const GOOGLE_ACCOUNT_SIGNUP_MESSAGE =
  'This email is already registered through Google. Please continue with Google to sign in.';
const GOOGLE_ACCOUNT_LOGIN_MESSAGE =
  'This account was created with Google. Please sign in with Google instead of email and password.';

const USER_LOOKUP_PAGE_SIZE = 100;
const USER_LOOKUP_MAX_PAGES = 100;

/**
 * Supabase records the sign-in methods available for an account under
 * app_metadata. `provider` is the most recent one and `providers` is the full
 * list, so both are consulted before concluding that an account has no
 * email/password credentials.
 */
function hasPasswordIdentity(user) {
  const providers = Array.isArray(user?.app_metadata?.providers)
    ? user.app_metadata.providers
    : [];
  return providers.includes('email') || user?.app_metadata?.provider === 'email';
}

class AuthService {
  /**
   * Look up an auth user by email using the admin client.
   * Returns null when the address is unknown, and also when the lookup itself
   * fails - callers treat "unknown" as "let Supabase decide" rather than
   * blocking a legitimate signup on a transient admin API error.
   */
  async _findAuthUserByEmail(email) {
    if (!email || shouldUseTestAuth()) {
      return null;
    }

    try {
      const adminClient = getSupabaseAdminClient();
      const normalizedEmail = email.trim().toLowerCase();

      for (let page = 1; page <= USER_LOOKUP_MAX_PAGES; page += 1) {
        const { data, error } = await adminClient.auth.admin.listUsers({
          page,
          perPage: USER_LOOKUP_PAGE_SIZE,
        });

        if (error) {
          warn(`Failed to inspect auth user for ${email}:`, error);
          return null;
        }

        const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
        const matchedUser = users.find(
          (user) => user.email?.trim().toLowerCase() === normalizedEmail,
        );

        if (matchedUser) {
          return matchedUser;
        }

        if (users.length < USER_LOOKUP_PAGE_SIZE) {
          return null;
        }
      }
    } catch (error) {
      warn(`Failed to determine login provider for ${email}:`, error);
    }

    return null;
  }

  async _getOAuthLoginHint(email) {
    const matchedUser = await this._findAuthUserByEmail(email);

    if (matchedUser && !hasPasswordIdentity(matchedUser)) {
      return GOOGLE_ACCOUNT_LOGIN_MESSAGE;
    }

    return null;
  }

  /**
   * Sign up a new user.
   * If email confirmation is enabled in Supabase, no session is returned.
   */
  async signup({ email, password, full_name, avatar_url }) {
    try {
      if (shouldUseTestAuth()) {
        const result = signupTestUser({ email, password, full_name });
        if (result.session) {
          info(`User profile created for ${email}`);
        } else {
          info(`Signup pending verification for ${email}`);
        }
        return result;
      }

      // Supabase's email-enumeration protection makes signUp respond as if a
      // duplicate address were brand new, so an existing account has to be
      // detected up front to tell the user what actually happened.
      const existingUser = await this._findAuthUserByEmail(email);
      if (existingUser) {
        if (!hasPasswordIdentity(existingUser)) {
          throw new AppError(GOOGLE_ACCOUNT_SIGNUP_MESSAGE, 409);
        }

        if (existingUser.email_confirmed_at) {
          throw new AppError(EXISTING_ACCOUNT_SIGNUP_MESSAGE, 409);
        }

        // An unconfirmed password account is not a usable login yet, so fall
        // through and let Supabase resend the confirmation email.
        info(`Resending signup verification for unconfirmed account ${email}`);
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: full_name || null,
          },
        },
      });

      if (error) {
        _error('Signup auth error:', error);
        if (/already\s+(registered|exists)|user\s+already/i.test(error.message || '')) {
          throw new AppError(EXISTING_ACCOUNT_SIGNUP_MESSAGE, 409);
        }
        throw new Error(error.message || 'Failed to create user account');
      }

      // Supabase returns the user at data.user. Keep the session fallback for
      // clients/proxies that only expose it under data.session.user.
      const user = data?.user || data?.session?.user;
      const session = data?.session || null;

      // Second line of defence for when the admin lookup above was unavailable:
      // the decoy user returned for a duplicate address carries no identities,
      // whereas a genuinely new signup always has at least one.
      if (user && Array.isArray(user.identities) && user.identities.length === 0) {
        throw new AppError(EXISTING_ACCOUNT_SIGNUP_MESSAGE, 409);
      }

      if (!user) {
        // Supabase can intentionally omit the user object for an existing
        // unconfirmed address while still sending the confirmation email.
        // The client can verify using the email and OTP, so do not turn this
        // pending-verification response into a 500.
        if (!session) {
          warn(`Signup pending verification for ${email}; user details were omitted by Supabase`);
          return {
            user: null,
            session: null,
            message: 'Verification email sent. Please confirm your email address.',
          };
        }

        throw new Error('Signup completed without a user record');
      }

      // If email confirmation is required, session will be null
      if (!session) {
        info(`Signup pending verification for ${email}`);
        return {
          user: {
            id: user.id,
            email: user.email,
            full_name,
            avatar_url: avatar_url || null,
            is_active: true,
            profile_completed: false,
            created_at: user.created_at || new Date().toISOString(),
            updated_at: user.updated_at || new Date().toISOString(),
          },
          session: null,
          message: 'Verification email sent. Please confirm your email address.',
        };
      }

      // Email confirmation disabled – create profile and return session
      try {
        const avatarUrl = avatar_url || generateRandomAvatarUrl(email, full_name);
        await initializeUserProfile(user.id, email, full_name, session.access_token, avatarUrl);
        info(`User profile created for ${email}`);
      } catch (profileError) {
        _error(`Failed to create user profile for ${email}:`, profileError);
      }

      await this._logAudit({
        user_id: user.id,
        action: 'signup',
        resource_type: 'user',
        resource_id: user.id,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          full_name,
          avatar_url: avatar_url || generateRandomAvatarUrl(email, full_name),
          is_active: true,
          profile_completed: false,
          created_at: user.created_at || new Date().toISOString(),
          updated_at: user.updated_at || new Date().toISOString(),
        },
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
          expires_at: session.expires_at,
          token_type: session.token_type,
        },
        message: 'Signup successful',
      };
    } catch (error) {
      _error('Signup error:', error);
      throw error;
    }
  }

  async login({ email, password }) {
    try {
      if (shouldUseTestAuth()) {
        return loginTestUser({ email, password });
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        warn(`Login failed for ${email}: ${error.message}`);
        if (error.message === 'Email not confirmed') {
          throw new Error('Please verify your email address before logging in.');
        }
        if (error.message === 'Invalid login credentials') {
          const oauthHint = await this._getOAuthLoginHint(email);
          if (oauthHint) {
            throw new Error(oauthHint);
          }
        }
        throw new Error(error.message || 'Invalid email or password');
      }

      const { user, session } = data;
      let userProfile = null;

      if (session?.access_token) {
        const userSupabase = getSupabaseClientForToken(session.access_token);
        const { data } = await userSupabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        userProfile = data;
      }

      await this._logAudit({
        user_id: user.id,
        action: 'login',
        resource_type: 'user',
        resource_id: user.id,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
        full_name: userProfile?.full_name || null,
        avatar_url: userProfile?.avatar_url || null,
        is_active: userProfile?.is_active ?? true,
        profile_completed: userProfile?.profile_completed ?? false,
        created_at: userProfile?.created_at || user.created_at || new Date().toISOString(),
        updated_at: userProfile?.updated_at || new Date().toISOString(),
      },
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
          expires_at: session.expires_at,
          token_type: session.token_type,
        },
      };
    } catch (error) {
      _error('Login error:', error);
      throw error;
    }
  }

  /**
   * Google OAuth – get the URL to redirect the user to
   */
  async googleSignIn(customRedirectUri = null) {
    const redirectTo = validateOAuthRedirectUri(customRedirectUri)
      || `${getBaseUrl('BACKEND_URL', 3000)}/api/v1/auth/google/callback`;

    if (shouldUseTestAuth()) {
      return { url: getTestGoogleOAuthUrl(redirectTo) };
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw new Error(error.message);
    return { url: data.url };
  }

  /**
   * Exchange OAuth code for a session
   */
  async handleGoogleCallback(code) {
    if (shouldUseTestAuth()) {
      return this._handleTestGoogleCallback(code);
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new Error(error.message);
    const { user, session } = data;

    // Ensure user profile exists
    const googleAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
    await initializeUserProfile(user.id, user.email, user.user_metadata?.full_name, session.access_token, googleAvatar);

    await this._logAudit({
      user_id: user.id,
      action: 'google_login',
      resource_type: 'user',
      resource_id: user.id,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || null,
        avatar_url: googleAvatar,
      },
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: session.token_type,
      },
    };
  }

  /**
   * Complete Google sign-in from an implicit-flow redirect.
   *
   * Supabase returns the session in the redirect URL's fragment
   * (`#access_token=...&refresh_token=...`) rather than as an exchangeable
   * code, so the app reads it off the deep link and posts it here. The access
   * token is verified against Supabase before any profile row is touched — an
   * unverified token would let a caller bootstrap a profile for any user id it
   * cared to claim.
   */
  async handleGoogleTokens({ accessToken, refreshToken }) {
    if (!accessToken || !refreshToken) {
      throw new AppError('Missing Google session tokens', 400);
    }

    if (shouldUseTestAuth()) {
      return this._handleTestGoogleTokens(accessToken, refreshToken);
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data?.user) {
      throw new AppError('Invalid or expired Google session', 401);
    }

    const { user } = data;
    const googleAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
    await initializeUserProfile(user.id, user.email, user.user_metadata?.full_name, accessToken, googleAvatar);

    await this._logAudit({
      user_id: user.id,
      action: 'google_login',
      resource_type: 'user',
      resource_id: user.id,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || null,
        avatar_url: googleAvatar,
      },
      session: {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
      },
    };
  }

  /**
   * Verify email using token from confirmation link
   */
  async verifyEmail(token, email) {
    if (shouldUseTestAuth()) {
        return verifyTestEmail(token);
      }

    const supabase = getSupabaseClient();
    const verificationRequest = email
      ? { email, token, type: 'email' }
      : { token_hash: token, type: 'email' };
    const { data, error } = await supabase.auth.verifyOtp(verificationRequest);
    if (error) throw new Error(error.message);

    // If email confirmation is enabled, create profile now with an avatar
    // (only if not already created by some other flow)
      const { user } = data;
      const avatarUrl = generateRandomAvatarUrl(user.email, user.user_metadata?.full_name);
      try {
      // Use admin client because the user may not have an active session
      const adminClient = getSupabaseAdminClient();
      // Check if profile already exists
      const { data: existing } = await adminClient
        .from('users')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      if (!existing) {
        await initializeUserProfile(user.id, user.email, user.user_metadata?.full_name, null, avatarUrl);
      }
    } catch (err) {
      warn('Failed to create user profile after email verification:', err);
    }

    return { message: 'Email verified successfully' };
  }

  async resendVerification(email) {
    if (shouldUseTestAuth()) {
      return { message: 'Verification code sent' };
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) {
      throw new Error(error.message || 'Could not resend verification code');
    }

    return { message: 'Verification code sent' };
  }

  /**
   * Exchange a refresh token for a fresh session.
   *
   * Access tokens are short-lived by design, so the app trades its refresh
   * token for a new pair whenever one expires. Supabase rotates the refresh
   * token on every call and only invalidates it on sign-out, which is what
   * keeps a session alive indefinitely for a user who never logs out.
   */
  async refreshSession(refreshToken) {
    if (!refreshToken) {
      throw new AppError('Refresh token required', 401);
    }

    if (shouldUseTestAuth()) {
      try {
        return refreshTestSession(refreshToken);
      } catch (error) {
        throw new AppError(error.message || 'Invalid or expired refresh token', 401);
      }
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data?.session) {
      warn('Session refresh failed:', error?.message || 'No session returned');
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const { session } = data;
    const user = data.user || session.user;
    let userProfile = null;

    try {
      const userSupabase = getSupabaseClientForToken(session.access_token);
      const { data: profile } = await userSupabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      userProfile = profile;
    } catch (profileError) {
      // A missing profile row must not cost the user their refreshed session.
      warn(`Failed to load profile during refresh for ${user?.email}:`, profileError);
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: userProfile?.full_name || null,
        avatar_url: userProfile?.avatar_url || null,
        is_active: userProfile?.is_active ?? true,
        profile_completed: userProfile?.profile_completed ?? false,
        created_at: userProfile?.created_at || user.created_at || new Date().toISOString(),
        updated_at: userProfile?.updated_at || new Date().toISOString(),
      },
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: session.token_type,
      },
    };
  }

  async logout(accessToken, userId) {
    try {
      if (!accessToken) {
        throw new Error('Access token required');
      }

      if (shouldUseTestAuth()) {
        return logoutTestUser(accessToken, userId);
      }

      const { error } = await getSupabaseClientForToken(accessToken).auth.signOut();

      if (error) {
        throw new Error(error.message || 'Logout failed');
      }

      await this._logAudit({
        user_id: userId,
        action: 'logout',
        resource_type: 'user',
        resource_id: userId,
      });

      return { message: 'Logout successful' };
    } catch (error) {
      _error('Logout error:', error);
      throw error;
    }
  }

  async forgotPassword(email) {
    try {
      if (shouldUseTestAuth()) {
        return requestTestPasswordReset(email);
      }

      const supabase = getSupabaseClient();
      // The recovery email must contain {{ .Token }}. The app verifies that
      // six-digit code directly; it does not depend on a browser redirect.
      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) {
        _error('Forgot password error:', error);
        throw new Error(error.message || 'Failed to send password reset email');
      }

      return { message: 'If an account exists with this email, a password reset code will be sent' };
    } catch (error) {
      _error('Forgot password service error:', error);
      throw error;
    }
  }

  async resetPassword({ email, token, token_hash, code, access_token, password }) {
    try {
      if (shouldUseTestAuth()) {
        return { message: 'Password reset successful. Please log in with your new password.' };
      }

      const supabase = getSupabaseClient();
      let recoveryAccessToken = access_token;

      if (!recoveryAccessToken && code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          warn('Password reset code exchange failed:', error.message);
          throw new Error('Invalid or expired reset link');
        }
        recoveryAccessToken = data.session?.access_token;
      }

      if (!recoveryAccessToken && (token || token_hash)) {
        const verificationRequest = token_hash
          ? { token_hash, type: 'recovery' }
          : { email, token, type: 'recovery' };
        const { data, error } = await supabase.auth.verifyOtp(verificationRequest);

        if (error) {
          warn('Password reset token verification failed:', error.message);
          throw new Error('Invalid or expired reset token');
        }

        recoveryAccessToken = data.session?.access_token;
      }

      if (!recoveryAccessToken) {
        throw new Error('Invalid or expired reset link');
      }

      const { data: recoveryUser, error: recoveryUserError } = await supabase.auth.getUser(recoveryAccessToken);
      if (recoveryUserError || !recoveryUser.user?.id) {
        throw new Error('Invalid or expired reset session');
      }

      const { error: updateError } = await getSupabaseAdminClient().auth.admin.updateUserById(
        recoveryUser.user.id,
        { password },
      );

      if (updateError) {
        _error('Password update error:', updateError);
        throw new Error(updateError.message || 'Failed to update password');
      }

      return { message: 'Password reset successful. Please log in with your new password.' };
    } catch (error) {
      _error('Reset password error:', error);
      throw error;
    }
  }

  async verifyPasswordResetOtp({ email, token }) {
    if (shouldUseTestAuth()) {
      return verifyTestPasswordResetOtp(email, token);
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    });

    if (error || !data.session?.access_token) {
      throw new Error('Invalid or expired verification code');
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  }

  async changePassword({ current_password, new_password, accessToken, userId, email }) {
    try {
      if (!accessToken || !userId || !email) {
        throw new Error('Authentication required');
      }

      if (shouldUseTestAuth()) {
        return changeTestUserPassword(accessToken, current_password, new_password);
      }

      // Supabase's updateUser call does not verify the old password. Verify it
      // first with a password sign-in, then update this same user by ID. The
      // admin API is used for the second step because a raw bearer header is
      // not a persisted Supabase session for updateUser().
      const supabase = getSupabaseClient();
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password: current_password,
      });

      if (loginError || loginData.user?.id !== userId) {
        throw new Error('Current password is incorrect');
      }

      const { error: updateError } = await getSupabaseAdminClient().auth.admin.updateUserById(userId, {
        password: new_password,
      });

      if (updateError) {
        _error('Change password update error:', updateError);
        throw new Error(updateError.message || 'Failed to change password');
      }

      return { message: 'Password changed successfully' };
    } catch (error) {
      _error('Change password error:', error);
      throw error;
    }
  }

  async getCurrentUser(accessToken) {
    try {
      if (shouldUseTestAuth()) {
        return getCurrentTestUser(accessToken);
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getUser(accessToken);

      if (error) {
        throw new Error('Invalid or expired token');
      }

      const authUser = data.user;
      const userSupabase = getSupabaseClientForToken(accessToken);
      const { data: userProfile } = await userSupabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      return {
        id: authUser.id,
        email: authUser.email,
        full_name: userProfile?.full_name || null,
        avatar_url: userProfile?.avatar_url || null,
        avatar_updated_at: userProfile?.avatar_updated_at || null,
        created_at: userProfile?.created_at || null,
      };
    } catch (error) {
      _error('Get current user error:', error);
      throw error;
    }
  }

  async _logAudit({ user_id, action, resource_type, resource_id, details = null }) {
    const supabase = getSupabaseClient();

    try {
      await supabase.from('audit_log').insert([
        {
          user_id,
          action,
          resource_type,
          resource_id,
          details,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      warn('Failed to log audit trail:', error);
    }
  }

  async _handleTestGoogleCallback(code) {
    if (!code) {
      throw new Error('Missing authorization code');
    }

    return {
      user: {
        id: `google-${code}`,
        email: `google-${code}@example.com`,
        full_name: null,
        avatar_url: null,
      },
      session: {
        access_token: `test-access.${code}`,
        refresh_token: `test-refresh.${code}`,
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
      },
    };
  }

  async _handleTestGoogleTokens(accessToken, refreshToken) {
    return {
      user: {
        id: `google-${accessToken}`,
        email: `google-${accessToken}@example.com`,
        full_name: null,
        avatar_url: null,
      },
      session: {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
      },
    };
  }
}

export default new AuthService();
