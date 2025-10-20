# Setup Guide for PRF Encryption

## Prerequisites

- Bun installed
- Cloudflare account with Workers and R2 enabled
- Modern browser with WebAuthn Level 3 support (Chrome 108+, Edge 108+)
- Authenticator with PRF support (most modern platform authenticators)

## Initial Setup

### 1. Install Dependencies

```bash
# From project root
bun install
```

### 2. Configure Cloudflare

```bash
cd server

# Login to Cloudflare
wrangler login

# Create D1 Database
wrangler d1 create webauthn-db

# Create R2 Bucket
wrangler r2 bucket create webauthn-blobs
```

### 3. Update wrangler.toml

Add your D1 and R2 bindings:

```toml
[[d1_databases]]
binding = "DB"
database_name = "webauthn-db"
database_id = "your-database-id-here"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "webauthn-blobs"
```

### 4. Run Database Schema

```bash
# From server directory
wrangler d1 execute DB --file=./schema.sql
```

### 5. Environment Variables

Create `client/.env`:

```bash
VITE_SERVER_URL=http://localhost:8787
```

For production, update to your Workers URL.

## Running the Application

### Development Mode

Terminal 1 - Server:
```bash
cd server
bun run dev
# Server runs on http://localhost:8787
```

Terminal 2 - Client:
```bash
cd client
bun run dev
# Client runs on http://localhost:5173
```

### Access the App

Open http://localhost:5173 in your browser.

## Testing PRF Encryption

### Step 1: Register
1. Enter a username
2. Click "Register Passkey"
3. Complete biometric authentication
4. Success message appears

### Step 2: Authenticate
1. Click "Authenticate with Passkey"
2. Complete biometric authentication
3. Look for "PRF encryption key available" message

### Step 3: Encrypt Data
1. Click "Generate & Encrypt Random Blob"
2. System encrypts 1KB of random data
3. Stores in R2
4. Success message shows R2 key

### Step 4: Decrypt Data
1. Click "Retrieve & Decrypt Blob"
2. System fetches from R2
3. Decrypts using PRF key
4. Shows preview of decrypted data

## Troubleshooting

### "PRF extension not available"

**Possible causes:**
- Browser doesn't support WebAuthn Level 3
- Authenticator doesn't support PRF
- Using external security key (most don't support PRF)

**Solutions:**
- Use Chrome/Edge 108+ 
- Use platform authenticator (Face ID, Touch ID, Windows Hello)
- Check browser console for extension results

### "Blob not found"

**Cause:** Trying to decrypt before encrypting

**Solution:** Click "Generate & Encrypt Random Blob" first

### Server errors

**Check:**
- R2 bucket exists and is bound correctly
- D1 database schema is applied
- wrangler.toml bindings are correct

### CORS errors

**Cause:** Origin mismatch

**Solution:** Ensure client is on http://localhost:5173 or update origin in server/src/index.ts

## Browser Compatibility

### Supported Browsers
- Chrome 108+
- Edge 108+
- Safari 16.4+ (macOS only)

### Supported Authenticators
- ✅ Touch ID (macOS)
- ✅ Face ID (iOS/macOS)
- ✅ Windows Hello
- ❌ Most external security keys (YubiKey, etc.)

## Production Deployment

### Deploy Server

```bash
cd server
wrangler deploy
```

Your API will be available at: `https://your-worker.your-subdomain.workers.dev`

### Update Client Environment

```bash
# client/.env.production
VITE_SERVER_URL=https://your-worker.your-subdomain.workers.dev
```

### Build and Deploy Client

```bash
cd client
bun run build
# Deploy dist/ folder to your hosting provider
```

### Update rpID and Origin

In `server/src/index.ts`, update:
```typescript
const rpID = "your-domain.com";
const origin = `https://${rpID}`;
```

## Migration for Existing Databases

If you already have a deployed database:

```bash
cd server
wrangler d1 execute DB --file=./migrations/001_add_blob_columns.sql
```

## Security Notes

⚠️ **Important Warnings:**

1. **Deleting a passkey = permanent data loss**
   - No password recovery mechanism
   - Warn users before deletion

2. **PRF salt is session-based**
   - Currently regenerated on page refresh
   - Production should persist or derive from user input

3. **Test thoroughly**
   - Ensure PRF works on target devices
   - Test encryption/decryption flow
   - Verify R2 storage limits

## Next Steps

After setup:
1. Test the complete flow
2. Customize blob generation (currently random data)
3. Implement your use case (file upload, secrets storage, etc.)
4. Add proper error handling
5. Implement salt persistence strategy
6. Add user warnings about data loss

## Support

For issues with:
- **WebAuthn**: Check browser console and authenticator support
- **Cloudflare**: Verify bindings in wrangler.toml
- **Encryption**: Review crypto.ts utility functions
- **General**: See PRF_IMPLEMENTATION.md for detailed docs
