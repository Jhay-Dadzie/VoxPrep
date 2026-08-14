# Backend Authentication Integration Guide

This document explains the authentication backend integration for the VoxPrep frontend.

## Overview

The frontend has been integrated with the Express.js/Supabase backend to handle user authentication and profile management. The integration includes:

- User signup and login
- Email verification
- Password reset
- Profile management
- Automatic token management
- Protected routes based on authentication state

## Architecture

### API Client (`lib/api-client.ts`)

Axios-based HTTP client with automatic token attachment and error handling.

**Features:**
- Automatic Bearer token attachment to all requests
- Request/response interceptors
- 401 error handling with token refresh support
- Configurable base URL via environment variable

**Usage:**
```typescript
import apiClient from '@/lib/api-client'
const response = await apiClient.get('/auth/me')
```

### Token Storage (`lib/token-storage.ts`)

Secure token and user data persistence using AsyncStorage.

**Stored Data:**
- `voxprep.access_token` - JWT access token
- `voxprep.refresh_token` - Refresh token
- `voxprep.user` - User profile object

**Key Functions:**
- `setTokens(accessToken, refreshToken, user)` - Save tokens and user
- `getAccessToken()` - Retrieve access token
- `getRefreshToken()` - Retrieve refresh token
- `getStoredUser()` - Retrieve stored user profile
- `clearTokens()` - Clear all auth data
- `updateStoredUser(userData)` - Update user profile in storage

### Auth Service (`services/auth.ts`)

Handles all authentication operations.

**Methods:**
- `signup(email, password, fullName?)` - Register new user
- `login(email, password)` - Authenticate user
- `googleSignIn()` - Authenticate via Google OAuth
- `logout()` - Sign out user
- `getCurrentUser()` - Fetch current user profile
- `forgotPassword(email)` - Request password reset
- `resetPassword(email, token, password)` - Reset password
- `verifyEmail(token)` - Verify email address

### User Service (`services/user.ts`)

Manages user profile operations.

**Methods:**
- `getProfile()` - Fetch user profile
- `updateProfile(data)` - Update profile fields
- `updateStatus(isActive)` - Activate/deactivate account
- `completeProfile()` - Mark profile as completed
- `deleteAccount()` - Delete user account

### Auth Context (`hooks/auth-context.tsx`)

Global auth state management following React Context pattern.

**Provides:**
- `user` - Current user object or null
- `isSignedIn` - Boolean indicating authentication status
- `isLoading` - Boolean indicating loading state
- `error` - AuthError object if error occurred
- `signup()` - Register new user
- `login()` - Authenticate user
- `googleSignIn()` - Authenticate via Google OAuth
- `logout()` - Sign out user
- `clearError()` - Clear error state

**Usage:**
```typescript
import { useAuth } from '@/hooks/auth-context'

export default function MyComponent() {
  const { user, isSignedIn, login } = useAuth()
  
  if (!isSignedIn) return <LoginScreen />
  return <Dashboard user={user} />
}
```

### Error Handling (`services/error-handler.ts`)

Centralized error parsing and field-level validation.

**Classes:**
- `AuthError` - Standard auth error with optional field and details
- `NetworkError` - Network connectivity error

**Functions:**
- `parseApiError(error)` - Convert axios error to AuthError
- `getFieldError(error, fieldName)` - Extract field-specific error

## Setup Instructions

### 1. Install Dependencies

```bash
cd frontend
npm install axios expo-web-browser
```

### 2. Configure Environment

Create `.env.local` with your backend URL:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

For production:
```env
EXPO_PUBLIC_API_URL=https://api.voxprep.com/api/v1
```

### 3. Configure Google OAuth (Required for Sign-In to Work)

**IMPORTANT:** Without this configuration, OAuth will redirect to localhost instead of your app.

#### Step 1: Get Your App's Deep Link URL

The app uses deep links for OAuth callbacks. Depending on your environment:

**Development (Expo):**
```
exp+voxprep://oauth-callback
```

**Production (Built app):**
```
frontend://oauth-callback
```

#### Step 2: Register Redirect URIs in Supabase

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Authentication** → **Providers** → **Google**
4. Add these redirect URIs under "Authorized redirect URIs":
   ```
   exp+voxprep://oauth-callback
   http://localhost:3000/api/v1/auth/google/callback
   http://localhost:5050/api/v1/auth/google/callback
   https://your-production-domain.com/api/v1/auth/google/callback
   ```
5. Click **Save**

#### Step 3: Set Up Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials (type: Web application)
3. Add authorized redirect URIs (same as above)
4. Copy the Client ID and Client Secret
5. Add them to Supabase (Providers → Google)

#### Step 4: How OAuth Works

- User clicks **Google Sign-In** button
- App requests OAuth URL from backend (`GET /api/v1/auth/google?redirectUri=exp+voxprep://oauth-callback`)
- Backend passes redirectUri to Supabase
- App opens OAuth URL in secure browser via `expo-web-browser`
- User authorizes with Google account
- Google redirects to `exp+voxprep://oauth-callback?code=...`
- Browser closes and returns code to app
- App sends code to backend callback (`GET /api/v1/auth/google/callback?code=...`)
- Backend exchanges code for session
- User is logged in automatically

### 5. Verify AuthProvider Wrapper

The root layout (`app/_layout.tsx`) already wraps the app with AuthProvider:

```typescript
<AuthProvider>
  <ModeProvider>
    <InterviewerProvider>
      <RootLayoutInner />
    </InterviewerProvider>
  </ModeProvider>
</AuthProvider>
```

### 6. (Optional) Use Secure Storage

For production, replace AsyncStorage with `expo-secure-store`:

```bash
npx expo install expo-secure-store
```

Update `lib/token-storage.ts` to use secure storage:

```typescript
import * as SecureStore from 'expo-secure-store'

export const setTokens = async (accessToken, refreshToken, user) => {
  await SecureStore.setItemAsync('access_token', accessToken)
  await SecureStore.setItemAsync('refresh_token', refreshToken)
  // ... store user in AsyncStorage for faster reads
}
```

## Navigation Flow

### Unauthenticated State
- User sees onboarding and auth screens (signup, signin, verify-email, etc.)

### Authenticated but Profile Incomplete
- User sees mode-select and interviewer-select screens
- Must complete profile setup to access main app

### Authenticated with Complete Profile
- User has full access to dashboard, practice, results tabs
- Can still access settings and profile management

This is controlled in `app/_layout.tsx` based on `isSignedIn` and `user.profile_completed`.

## Integrating with Screens

### Example: Using Auth in a Screen

```typescript
import { useAuth } from '@/hooks/auth-context'

export default function MyScreen() {
  const { user, isSignedIn, logout, isLoading, error } = useAuth()
  
  if (!isSignedIn) {
    return <RedirectToLogin />
  }

  if (error) {
    return <ErrorDisplay message={error.message} />
  }

  return (
    <View>
      <Text>Welcome, {user?.full_name}</Text>
      <Button onPress={logout}>
        {isLoading ? 'Logging out...' : 'Logout'}
      </Button>
    </View>
  )
}
```

### Example: Protected API Call

```typescript
import { userService } from '@/services/user'

async function handleUpdateProfile(name) {
  try {
    const updated = await userService.updateProfile({
      full_name: name
    })
    console.log('Updated:', updated)
  } catch (err) {
    if (err instanceof AuthError) {
      console.error('Auth failed:', err.message)
    }
  }
}
```

## Screens Already Integrated

✅ **Auth Screens:**
- `(authScreens)/signin.tsx` - Login with backend validation
- `(authScreens)/signup.tsx` - Register with backend
- `(authScreens)/verify-email.tsx` - Email verification
- `(authScreens)/forgotPassword.tsx` - Password reset request
- `(authScreens)/resetPassword.tsx` - Password reset completion

✅ **User Screens:**
- `(tabs)/profile.tsx` - Display user info and logout
- `app/_layout.tsx` - Navigation guards based on auth state

## Error Handling Examples

### Login Error
```typescript
try {
  await login(email, password)
} catch (err) {
  if (err instanceof AuthError) {
    // Show specific error message
    setErrorMessage(err.message)
    
    // Check field-specific errors
    const emailError = getFieldError(err, 'email')
    if (emailError) showInputError('email', emailError)
  }
}
```

### API Error Response
Backend returns:
```json
{
  "success": false,
  "message": "User already exists",
  "field": "email",
  "details": {
    "email": "This email is already registered"
  }
}
```

Frontend handles via `parseApiError()` → converts to `AuthError` with field info → displays in UI.

## Testing the Integration

### Test Signup
1. Open signup screen
2. Enter valid email and password
3. Verify backend receives request at `POST /api/v1/auth/signup`
4. Check that tokens are stored in AsyncStorage
5. Verify redirect to verify-email or mode-select screen

### Test Login
1. Open login screen
2. Enter registered credentials
3. Verify backend receives request at `POST /api/v1/auth/login`
4. Verify user is restored on app restart
5. Check profile screen displays correct name/email

### Test Logout
1. Open profile screen
2. Tap logout
3. Verify backend receives `POST /api/v1/auth/logout`
4. Verify tokens are cleared from storage
5. Verify redirect to signin screen

### Test Protected Route
1. With invalid/expired token in storage
2. Try to access API (e.g., user profile)
3. Verify 401 error is handled correctly
4. Verify user is redirected to signin

### Test Google Sign-In (Mobile)
1. Open signin or signup screen
2. Tap Google sign-in button
3. Browser opens with Google OAuth URL
4. Authorize with Google account
5. Browser closes automatically
6. App receives authorization code
7. App logs user in and redirects to home screen
8. Verify user profile displays correct Google account info

### Test Google Sign-In (Web)
1. Open signin or signup screen
2. Click Google sign-in button
3. New window opens with Google OAuth URL
4. Authorize with Google account
5. Redirected to backend callback endpoint
6. Backend redirects back to frontend
7. App logs user in automatically
8. Verify user profile displays correct Google account info

## Debugging

### Check Stored User
```typescript
import { getStoredUser } from '@/lib/token-storage'

const user = await getStoredUser()
console.log('Stored user:', user)
```

### Check API Requests
Enable axios logging:
```typescript
// In api-client.ts
apiClient.interceptors.request.use((config) => {
  console.log('Request:', config.method, config.url)
  return config
})
```

### Check Auth State
```typescript
const { isSignedIn, user, isLoading, error } = useAuth()
console.log({ isSignedIn, user, isLoading, error })
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EXPO_PUBLIC_API_URL` | `http://localhost:3000/api/v1` | Backend API base URL |

## File Structure

```
frontend/
├── lib/
│   ├── api-client.ts          # Axios HTTP client
│   └── token-storage.ts       # Token & user storage
├── services/
│   ├── auth.ts                # Auth API calls
│   ├── user.ts                # User API calls
│   └── error-handler.ts       # Error parsing
├── hooks/
│   └── auth-context.tsx       # Auth state provider
├── types/
│   └── api.ts                 # API TypeScript types
└── app/
    ├── _layout.tsx            # Root with navigation guards
    ├── (authScreens)/
    │   ├── signin.tsx         # Login screen
    │   ├── signup.tsx         # Register screen
    │   ├── verify-email.tsx   # Email verification
    │   ├── forgotPassword.tsx # Password reset request
    │   └── resetPassword.tsx  # Password reset
    └── (tabs)/
        └── profile.tsx        # User profile & logout
```

## Backend Endpoints Reference

### Auth Endpoints
- `POST /auth/signup` - Register new user
- `POST /auth/login` - Authenticate user
- `POST /auth/logout` - Sign out
- `GET /auth/me` - Get current user (protected)
- `GET /auth/google` - Get Google OAuth URL
- `GET /auth/google/callback` - Handle Google OAuth callback (with code parameter)
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password with token
- `GET /auth/verify-email` - Verify email with token

### User Endpoints (all protected)
- `GET /users/me` - Get user profile
- `PATCH /users/me` - Update profile fields
- `PATCH /users/me/status` - Activate/deactivate account
- `PATCH /users/me/complete-profile` - Mark profile completed
- `DELETE /users/me` - Delete account

## Next Steps

1. **Test with local backend** - Ensure backend is running on `localhost:3000`
2. **Integration testing** - Run through auth flows end-to-end
3. **Production deployment** - Update `EXPO_PUBLIC_API_URL` for production
4. **Add more screens** - Integrate other user management screens as needed
5. **Implement refresh token** - Add token refresh logic when backend is ready

## Troubleshooting

### Google Sign-In redirects to localhost instead of app
**Problem:** After OAuth, browser redirects to `localhost:5050` instead of returning to app

**Solution:**
1. Verify the deep link redirect URI is added to Supabase settings (see Configure Google OAuth section)
2. Check the exact format matches:
   - Development: `exp+voxprep://oauth-callback`
   - Production: `frontend://oauth-callback`
3. In Supabase, go to Authentication → Providers → Google
4. Verify the redirect URI appears in the "Authorized redirect URIs" list
5. Click **Save** after adding
6. Wait 2-3 minutes for changes to propagate
7. Try OAuth again

**Why this happens:** Without the deep link registered, Supabase doesn't recognize it and falls back to the default backend callback URL.

### Tokens not persisting
- Check AsyncStorage is working: `npx expo install @react-native-async-storage/async-storage`
- Verify permissions on iOS/Android manifests

### 401 errors on protected routes
- Ensure access token is valid
- Check token format in Authorization header
- Verify backend is expecting "Bearer <token>"

### CORS errors
- Backend should allow requests from frontend domain
- Check backend CORS configuration

### Network errors
- Verify backend is running
- Check `EXPO_PUBLIC_API_URL` is correct
- Test with curl: `curl http://localhost:3000/api/v1/auth/health`

### Google Sign-In fails with "No authorization code in callback"
- Ensure WebBrowser package is installed: `npx expo install expo-web-browser`
- Check that `Linking.createURL('oauth-callback')` generates correct format
- Verify OAuth URL from backend is valid (not an error response)

## Support

For integration issues:
1. Check browser DevTools network tab for API requests
2. Review error messages from `error-handler.ts`
3. Check backend logs for request details
4. Verify all dependencies are installed: `npm install`
