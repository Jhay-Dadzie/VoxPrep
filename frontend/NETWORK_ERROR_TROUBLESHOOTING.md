# Network Error Troubleshooting Guide

If you're getting "Network Error" when trying to sign up or login, follow these steps:

## Step 1: Verify Backend is Running

Check that your backend is actually running on port 5050:

```bash
# In your backend directory
npm run dev
# or
npm start
```

You should see output like:
```
Server running on port 5050
```

## Step 2: Test Backend Connection Directly

Open a terminal and test the backend health endpoint:

```bash
curl http://localhost:5050/api/v1/auth/health
```

Expected response:
```json
{
  "success": true,
  "message": "Auth service is healthy"
}
```

If this fails, your backend isn't running or isn't on port 5050.

## Step 3: Verify Environment Variable

Check that `.env.local` has the correct URL:

```env
EXPO_PUBLIC_API_URL=http://localhost:5050/api/v1
```

**Important for React Native:**
- On web/simulator: use `localhost`
- On real device: use your computer's IP (e.g., `http://192.168.x.x:5050/api/v1`)

## Step 4: Check CORS Configuration on Backend

The backend must allow requests from your frontend. Check your backend's CORS configuration.

For Express, typically in `app.js` or a middleware file:

```javascript
const cors = require('cors');

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5050',
    'http://localhost:8081',
    'http://localhost:3005',
    // Add your frontend URLs here
  ],
  credentials: true,
}));
```

## Step 5: Enable Debug Logging

The app now logs detailed error information. Check your browser console or app logs:

1. **On Web**: Open DevTools (F12) → Console tab
2. **On iOS**: Use Xcode console
3. **On Android**: Use Android Studio logcat or `adb logcat`

You should see something like:
```
API Base URL: http://localhost:5050/api/v1
Signup request: { email: "..." }
AxiosError details: { status: ..., url: "...", ... }
```

This will show:
- ✅ If the API URL is correct
- ✅ If the request is being sent
- ❌ What the actual error is (status code, CORS issue, timeout, etc.)

## Step 6: Common Issues and Solutions

### Issue: Cannot connect to backend

**Cause**: Backend not running or wrong port

**Solution**:
```bash
# Check if port 5050 is in use
lsof -i :5050  # macOS/Linux
netstat -ano | findstr :5050  # Windows

# Start backend
npm run dev
```

### Issue: CORS Error

**Cause**: Backend doesn't allow frontend origin

**Solution**: Add CORS configuration to backend

### Issue: Connection timeout

**Cause**: Firewall blocking connection or backend not responding

**Solution**:
- Check firewall settings
- Ensure backend is actually running
- Try increasing timeout in `lib/api-client.ts`:
  ```typescript
  timeout: 30000, // Increase to 30 seconds
  ```

### Issue: "localhost" doesn't work on device

**Cause**: Using localhost on real phone/device

**Solution**: Use your computer's IP address:
```bash
# Get your IP
ipconfig getifaddr en0  # macOS
ipconfig  # Windows

# Update .env.local
EXPO_PUBLIC_API_URL=http://192.168.x.x:5050/api/v1
```

## Step 7: Test API Call Manually

Copy this into your app or browser console to test:

```typescript
import apiClient from '@/lib/api-client'

// Test the health endpoint
const test = async () => {
  try {
    const response = await apiClient.get('/auth/health')
    console.log('✅ Backend is reachable:', response.data)
  } catch (error) {
    console.error('❌ Backend unreachable:', error.message)
  }
}

test()
```

## Step 8: Restart App

After making any changes:

1. **Stop the development server**: Press `Ctrl+C`
2. **Clear cache**: `npm start -- --clear` or `expo start -c`
3. **Restart the app**: Press `r` in the terminal

## Network Error Messages

| Message | Cause | Solution |
|---------|-------|----------|
| `Network Error` | Generic network issue | Check backend is running |
| `ERR_NETWORK` | CORS or connection refused | Check CORS config, firewall |
| `ECONNREFUSED` | Connection refused | Backend not running on that port |
| `ENOTFOUND` | DNS resolution failed | Check URL spelling |
| `ECONNABORTED` | Request timeout | Backend too slow or not responding |

## Full Debug Checklist

- [ ] Backend is running: `npm run dev`
- [ ] Backend responds to health check: `curl http://localhost:5050/api/v1/auth/health`
- [ ] `.env.local` has correct URL: `EXPO_PUBLIC_API_URL=http://localhost:5050/api/v1`
- [ ] Backend CORS allows frontend origin
- [ ] No firewall blocking port 5050
- [ ] Browser console shows correct API URL in logs
- [ ] Request is being sent (visible in Network tab or logs)
- [ ] Timeout is sufficient (15 seconds)

## Still Having Issues?

1. **Check browser DevTools Network tab** - See if request is sent and what response is received
2. **Check backend logs** - See if the request reaches the backend
3. **Check firewall** - Ensure port 5050 isn't blocked
4. **Try different URL** - Test with `http://127.0.0.1:5050/api/v1`
5. **Check CORS headers** - Request should have `Origin: http://localhost:...`

## Debugging Code

The app now includes detailed logging. Look for output like:

```
API Base URL: http://localhost:5050/api/v1
Signup request: { email: "test@example.com" }
AxiosError details: {
  status: 404,
  url: "http://localhost:5050/api/v1/auth/signup",
  method: "post",
  message: "Request failed with status code 404",
  code: "ERR_BAD_RESPONSE",
  responseData: {...}
}
```

This tells you:
- The exact URL being called
- Whether the request reached the server
- What status code was returned
- What the server responded with

## Contact Backend Developer

If the backend endpoint returns an error (not a network error), provide them with:
- The endpoint: `/auth/signup` or `/auth/login`
- The request body (email, password)
- The response status code
- The response body
- Any error messages from backend logs
