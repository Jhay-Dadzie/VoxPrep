# Signup Error Troubleshooting Guide

## Error: "User not created" (Status 500)

This error means your backend signup endpoint is working but failing to create the user in the database.

## 🔍 Debugging Steps

### Step 1: Check Backend Logs

When the signup fails, look at your **backend terminal** for detailed error messages:

```bash
# In backend directory
npm run dev
# Watch the console output when signup fails
```

You should see something like:
```
Error: [detailed error message]
User not created
```

### Step 2: Verify Backend Environment Variables

Check your backend `.env` file has all required variables:

```env
# Database
DATABASE_URL=your_database_url
SUPABASE_URL=your_supabase_url
SUPABASE_SECRET_KEY=your_supabase_secret

# Email/OTP Service
SENDGRID_API_KEY=your_sendgrid_key
# OR
MAILGUN_API_KEY=your_mailgun_key
# OR whatever email service you use

# JWT
JWT_SECRET=your_jwt_secret

# Server
PORT=5050
NODE_ENV=development
```

### Step 3: Test Backend Signup Directly

Use curl to test the backend endpoint:

```bash
curl -X POST http://localhost:5050/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "full_name": "Test User"
  }'
```

Expected success response:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "email": "test@example.com",
      "full_name": "Test User",
      ...
    },
    "access_token": "...",
    "refresh_token": "..."
  }
}
```

Error response:
```json
{
  "success": false,
  "message": "User not created"
}
```

### Step 4: Check Database Connection

Verify your database is accessible:

```bash
# PostgreSQL
psql -h localhost -U your_user -d your_database -c "SELECT 1"

# Or check connection string in .env
echo $DATABASE_URL
```

### Step 5: Check Email Service Configuration

If using OTP via email:

1. ✅ Verify email service API key is valid
2. ✅ Check sender email address is configured
3. ✅ Verify email templates exist (if using)
4. ✅ Check rate limits on email service

### Step 6: Review Backend Signup Code

Check `backend/src/modules/auth/auth.service.js` for:

```javascript
// Common failure points:
- User validation failing
- Database insert failing
- Email sending failing
- JWT token generation failing
- Transaction rolling back
```

## Common Causes

| Issue | Solution |
|-------|----------|
| Missing email service config | Add `SENDGRID_API_KEY` or equivalent to `.env` |
| Database not accessible | Check `DATABASE_URL` connection string |
| User already exists | Use different email in test |
| Invalid password format | Password too short or wrong format |
| Database schema missing | Run migrations: `npm run migrate` |
| JWT secret not set | Add `JWT_SECRET` to `.env` |
| Supabase not configured | Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` |

## Backend Signup Response Format

The backend response should look like:

```typescript
{
  success: true,
  message: "User created successfully",
  data: {
    user: {
      id: string
      email: string
      full_name: string | null
      is_active: boolean
      profile_completed: boolean
      created_at: string
      updated_at: string
    },
    session?: {
      access_token: string
      refresh_token: string
    } | null,
    // Or at top level
    access_token?: string
    refresh_token?: string
  }
}
```

If response format is different, update `frontend/types/api.ts` `AuthResponse` interface.

## Debug Mode

Enable detailed logging on frontend:

```typescript
// In services/auth.ts, add:
console.log('Signup request payload:', data)
console.log('Backend response:', response.data)
```

## Common Backend Issues

### Issue: Email Field Validation

```
Error: Email validation failed
```

**Solution**: Check email regex in backend validation:
```javascript
// Should allow standard emails like: user@example.com
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
```

### Issue: Password Requirements

```
Error: Password does not meet requirements
```

**Solution**: Check password requirements in backend:
```javascript
// Typical requirements:
- Minimum 8 characters
- At least one uppercase letter
- At least one number
- At least one special character
```

### Issue: Database Constraint Violation

```
Error: Unique constraint violation on email
```

**Solution**: Clear test users from database:
```sql
DELETE FROM users WHERE email LIKE 'test%@example.com';
```

### Issue: OTP/Email Service Failure

```
Error: Failed to send verification email
```

**Solution**:
1. Check email service credentials
2. Verify sender email is whitelisted
3. Check email service rate limits
4. Test email service directly

## Frontend Configuration

Verify frontend `.env.local` is correct:

```env
EXPO_PUBLIC_API_URL=http://172.20.10.14:5050/api/v1
```

(Replace IP with your backend IP)

## Testing Checklist

- [ ] Backend is running on correct port (5050)
- [ ] All environment variables are set
- [ ] Database is accessible and migrated
- [ ] Email service is configured (if using OTP)
- [ ] Direct curl request to backend works
- [ ] Frontend can reach backend (check CORS)
- [ ] User doesn't already exist in database
- [ ] Password meets requirements
- [ ] Email is valid format

## Next Steps

1. **Check backend logs** - This is the most important
2. **Test curl request** - Isolate if it's frontend or backend
3. **Verify environment** - Ensure all config variables exist
4. **Check database** - Make sure tables exist and are accessible
5. **Enable debug logging** - Add more console logs in backend

## Support

If still failing:

1. Share the **full error message** from backend logs
2. Show the **exact curl request and response**
3. Provide **environment variable names** (not values)
4. Check **database logs** for the actual error

Common workaround while debugging:
- Use existing user for login testing instead of signup
- Temporarily disable OTP verification
- Comment out email sending to isolate the issue
