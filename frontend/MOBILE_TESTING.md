# Mobile Simulator Testing Guide

When testing on iOS simulator or Android emulator, `localhost` doesn't work the same as on web. Follow these instructions:

## Find Your Computer's IP Address

### Windows
```bash
ipconfig
```
Look for "IPv4 Address" under your active network connection.
Example: `192.168.1.100`

### macOS
```bash
ifconfig getifaddr en0
```
or
```bash
ipconfig getifaddr en1
```

### Linux
```bash
hostname -I
```

## Update Frontend Configuration

Edit `.env.local` and replace `localhost` with your IP:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:5050/api/v1
```

**Important:** Use your actual IP address from the commands above.

## Update Backend CORS

The backend has been configured to accept common IP ranges, but to be safe, also add your specific IP to `backend/src/app.js`:

```javascript
origin: [
  // ... existing entries ...
  'http://192.168.1.100:8081',  // Your computer's IP
  'http://192.168.1.100:3000',  // Your computer's IP (alt port)
]
```

Then restart the backend.

## Network Types and How to Access Them

### iOS Simulator (macOS)
- Simulator runs on your Mac
- To reach your Mac from the simulator, use your IP address
- Can also use `localhost` if running on same Mac, but IP is more reliable

### Android Emulator (Windows/Mac/Linux)
- **Special localhost proxy:** `10.0.2.2`
- This automatically forwards to your host machine's localhost
- So you can try: `http://10.0.2.2:5050/api/v1`

### Real Device (Phone/Tablet)
- Must be on same WiFi network as your computer
- Must use your computer's IP address
- Example: `http://192.168.1.100:5050/api/v1`

## Platform-Specific Setup

### iOS Simulator

1. **Update `.env.local`:**
   ```env
   EXPO_PUBLIC_API_URL=http://YOUR_IP:5050/api/v1
   ```

2. **Restart services:**
   ```bash
   # Stop frontend (Ctrl+C)
   npm start -- --clear
   
   # In another terminal, backend
   npm run dev
   ```

3. **Run on simulator:**
   ```bash
   npm run ios
   ```

### Android Emulator

**Option 1: Use Android's localhost proxy**
```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:5050/api/v1
```

**Option 2: Use your computer's IP**
```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:5050/api/v1
```

Run:
```bash
npm run android
```

### Real Device

1. **Ensure device is on same WiFi as your computer**

2. **Update `.env.local`:**
   ```env
   EXPO_PUBLIC_API_URL=http://192.168.1.100:5050/api/v1
   ```

3. **Start dev server (QR code mode):**
   ```bash
   npm start
   ```

4. **Scan QR code** with Expo Go app

## Troubleshooting

### Still getting network errors?

1. **Check backend is running:**
   ```bash
   curl http://192.168.1.100:5050/api/v1/auth/health
   ```

2. **Check CORS configuration** in `backend/src/app.js`
   - Backend must include your IP in the CORS origin list

3. **Check firewall:**
   - Windows: Check Windows Defender Firewall
   - Mac: System Preferences → Security & Privacy → Firewall
   - Ensure port 5050 is allowed

4. **Verify `.env.local` is correct:**
   ```bash
   # Check what's in .env.local
   cat .env.local
   ```

5. **Check console logs:**
   - The app should log "API Base URL: http://YOUR_IP:5050/api/v1"
   - If not, the environment variable isn't loading

### Simulator can't reach backend

Restart both:
```bash
# Terminal 1: Stop and restart frontend
Ctrl+C
npm start -- --clear

# Terminal 2: Restart backend
npm run dev
```

## Quick Reference

| Platform | API URL | How to Run |
|----------|---------|-----------|
| **Web** | `http://localhost:5050/api/v1` | `npm start` then open web |
| **iOS Sim** | `http://192.168.x.x:5050/api/v1` | `npm run ios` |
| **Android Emu** | `http://10.0.2.2:5050/api/v1` | `npm run android` |
| **Real Device** | `http://192.168.x.x:5050/api/v1` | `npm start` → scan QR |

(Replace `192.168.x.x` with your actual IP)

## Automated IP Detection

To automatically use your IP instead of localhost:

```bash
# Get your IP
node get-ip.js
```

This will print your IP address. Copy it and update `.env.local`:

```env
EXPO_PUBLIC_API_URL=http://[IP_FROM_ABOVE]:5050/api/v1
```

## Common Issues

### "localhost refused to connect"
**Cause**: Using localhost on mobile
**Fix**: Use your IP address instead

### "Connection timeout"
**Cause**: Firewall blocking the port
**Fix**: Allow port 5050 in firewall settings

### "CORS error even after updating"
**Cause**: Backend not restarted
**Fix**: Restart backend: `npm run dev`

### "Can't find backend from simulator"
**Cause**: Different network interfaces
**Fix**: Try different IPs or use `10.0.2.2` for Android

## Testing Checklist

- [ ] Found your IP address
- [ ] Updated `.env.local` with your IP
- [ ] Backend CORS includes your IP
- [ ] Restarted backend
- [ ] Restarted frontend with `npm start -- --clear`
- [ ] Backend responds to health check: `curl http://YOUR_IP:5050/api/v1/auth/health`
- [ ] App shows correct API URL in console logs
- [ ] Tried signup/login on simulator
- [ ] Checked console for detailed error messages

## Still Not Working?

1. Check if backend is actually running: `curl http://YOUR_IP:5050/api/v1/auth/health`
2. Check firewall isn't blocking port 5050
3. Verify `.env.local` has your correct IP
4. Look at backend logs for incoming requests
5. Check browser/app console for CORS errors
6. Try with `10.0.2.2` if on Android emulator
