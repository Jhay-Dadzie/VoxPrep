# Profile and Settings Integration Guide

This document explains the integrated user profile and settings features.

## Features Implemented

### 1. Personal Info Screen (`/settings/personal-info`)

**Functionality:**
- Displays current user's full name and email
- Allows editing of full name
- Email is read-only (for security)
- Saves changes to backend database
- Shows loading state while saving
- Displays error messages if save fails

**How It Works:**

1. **Load User Data**
   - On screen load, user's current information is populated from auth context
   - Email is displayed but disabled (read-only)
   - Full name is editable

2. **Edit Full Name**
   - User can type in the Full Name field
   - Changes are tracked to show "Save Changes" button is relevant
   - Save button is disabled if no changes

3. **Save to Backend**
   - Calls `userService.updateProfile({ full_name: newName })`
   - Shows "Saving..." while request is in progress
   - Success: Shows alert and navigates back
   - Error: Displays error message with option to retry

### 2. Profile Screen Logout

**Functionality:**
- Logout button on profile screen
- Confirmation dialog before logout
- Clears authentication tokens
- Auto-redirects to signin screen
- Shows loading state while logging out

**How It Works:**

1. **Logout Button**
   - Located at bottom of profile screen
   - Shows "Logout" when idle
   - Shows "Logging out..." while in progress
   - Button is disabled during logout

2. **Confirmation Dialog**
   - Displays when user taps logout
   - User must confirm action
   - Option to cancel

3. **Logout Process**
   - Calls `logout()` from auth context
   - Clears stored tokens and user data
   - Triggers auth state change
   - App automatically navigates to signin screen

### 3. User Data Integration

**Data Flow:**

```
Auth Context (user data)
    ↓
Personal Info Screen (displays & edits)
    ↓
userService.updateProfile()
    ↓
API Call to PATCH /users/me
    ↓
Backend Updates Database
    ↓
Response with updated user object
    ↓
Token Storage Updated
    ↓
Auth Context Re-renders
    ↓
Profile Screen Updates
```

## Usage Instructions

### For Users

**Editing Personal Information:**

1. Go to Profile → Settings (gear icon)
2. Tap on personal-info
3. Update Full Name as desired
4. Tap "Save Changes"
5. Wait for confirmation
6. Changes are saved to your account

**Logging Out:**

1. On Profile screen, scroll to bottom
2. Tap "Logout" button
3. Confirm when prompted
4. You'll be redirected to login screen

### For Developers

**Accessing User Data:**

```typescript
import { useAuth } from '@/hooks/auth-context'

export default function MyComponent() {
  const { user } = useAuth()
  
  return (
    <View>
      <Text>Welcome, {user?.full_name}</Text>
      <Text>Email: {user?.email}</Text>
    </View>
  )
}
```

**Updating User Profile:**

```typescript
import { userService } from '@/services/user'

async function updateName(newName: string) {
  try {
    const updated = await userService.updateProfile({
      full_name: newName
    })
    // Auth context is automatically updated
  } catch (err) {
    console.error('Update failed:', err)
  }
}
```

**Logging Out:**

```typescript
const { logout } = useAuth()

const handleLogout = async () => {
  try {
    await logout()
    // App automatically redirects to signin
  } catch (err) {
    console.error('Logout failed:', err)
  }
}
```

## Backend Integration

### Update Profile Endpoint

**Request:**
```
PATCH /api/v1/users/me
Headers: Authorization: Bearer <token>
Body: { full_name: "New Name" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-id",
    "email": "user@example.com",
    "full_name": "New Name",
    "is_active": true,
    "profile_completed": true,
    "created_at": "2024-01-01T...",
    "updated_at": "2024-01-02T..."
  }
}
```

### Logout Endpoint

**Request:**
```
POST /api/v1/auth/logout
Headers: Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## Error Handling

### Personal Info Save Errors

If save fails, user sees error message like:
- "Invalid email format"
- "Name too long"
- "Invalid characters in name"
- "Server error. Please try again."

User can:
1. Read error message
2. Fix the issue
3. Tap "Save Changes" again

### Logout Errors

If logout fails, user sees error dialog:
- "Failed to logout. Please try again."
- User can retry

Possible causes:
- Network error
- Invalid token
- Server error

## Testing Scenarios

### Test Profile Update

1. ✅ Edit full name to valid value
2. ✅ Tap "Save Changes"
3. ✅ Verify success message
4. ✅ Go back to profile, reopen → verify name updated
5. ✅ Try invalid values (too long, special chars) → verify error

### Test Logout

1. ✅ Tap logout button
2. ✅ Cancel confirmation → should stay logged in
3. ✅ Confirm logout → should redirect to signin
4. ✅ Verify tokens are cleared (check AsyncStorage)
5. ✅ Try to access protected route → should redirect to signin

## Styling

### Personal Info Screen

- White card with rounded corners
- Editable field: normal background
- Read-only field: disabled appearance with reduced opacity
- Error box: red background with icon
- Save button: enabled (tint color) when changes exist, disabled (gray) otherwise

### Profile Screen Logout

- Red text and icon
- Full width button
- Loading state shown in text
- Disabled during logout

## Troubleshooting

### Changes Not Saving

1. ✅ Check network connection
2. ✅ Verify backend is running
3. ✅ Check browser console for errors
4. ✅ Verify CORS is configured
5. ✅ Check backend logs for request details

### Logout Not Working

1. ✅ Check network connection
2. ✅ Verify auth tokens exist in AsyncStorage
3. ✅ Check browser console for errors
4. ✅ Verify backend logout endpoint is working

### User Data Not Loading

1. ✅ Verify user is authenticated
2. ✅ Check auth context has user object
3. ✅ Verify token is valid
4. ✅ Check backend returns user data

## Future Enhancements

- [ ] Profile picture upload
- [ ] Change password screen integration
- [ ] Additional profile fields (bio, location)
- [ ] Profile photo from camera
- [ ] Undo changes before saving
- [ ] Bulk profile updates
