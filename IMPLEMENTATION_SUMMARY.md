# PRF-Based WebAuthn Encryption - Implementation Summary

## What Was Implemented

This implementation adds **PRF (Pseudo-Random Function) extension** support to your WebAuthn authentication app, enabling **browser-based encryption** using cryptographic material derived from authenticators.

### Key Features

✅ **PRF Extension Integration** - Enabled in registration and authentication flows
✅ **Client-Side Encryption** - AES-GCM encryption using HKDF-derived keys
✅ **R2 Storage** - Encrypted blobs stored in Cloudflare R2
✅ **Database Tracking** - Blob references and nonces stored in D1
✅ **Complete UI** - Encrypt and decrypt random blobs via UI
✅ **Phishing-Resistant** - Keys are origin-bound via WebAuthn

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Client                              │
│                                                             │
│  1. User authenticates with passkey                        │
│  2. PRF extension returns 32 bytes                         │
│  3. HKDF derives AES-GCM key                               │
│  4. Encrypt random blob (1KB)                              │
│  5. Send to server                                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      Server (Hono)                          │
│                                                             │
│  1. Receive encrypted blob + nonce                         │
│  2. Store blob in R2                                       │
│  3. Store R2 key + nonce in D1                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Cloudflare Storage                        │
│                                                             │
│  R2: Encrypted blob data                                   │
│  D1: { encrypted_blob_key, blob_nonce }                    │
└─────────────────────────────────────────────────────────────┘
```

## Files Created

### Client
- ✨ `client/src/crypto.ts` - Crypto utilities (HKDF, AES-GCM, nonce generation)

### Server
- ✨ `server/wrangler.toml` - Cloudflare Workers configuration template
- ✨ `server/migrations/001_add_blob_columns.sql` - Database migration

### Documentation
- ✨ `PRF_IMPLEMENTATION.md` - Detailed technical documentation
- ✨ `SETUP.md` - Step-by-step setup guide
- ✨ `IMPLEMENTATION_SUMMARY.md` - This file

## Files Modified

### Client
- 📝 `client/src/App.tsx`
  - Added PRF salt generation
  - Modified registration to include PRF extension
  - Modified authentication to capture PRF output
  - Added `handleEncryptAndStore()` function
  - Added `handleRetrieveAndDecrypt()` function
  - Added encryption UI components

### Server
- 📝 `server/src/index.ts`
  - Added PRF extension to registration options
  - Added PRF extension to authentication options
  - Added `POST /store-blob` endpoint
  - Added `POST /retrieve-blob` endpoint

- 📝 `server/src/db.ts`
  - Added `saveUserBlobReference()` function
  - Added `getUserBlobReference()` function

- 📝 `server/schema.sql`
  - Added `encrypted_blob_key` column to users table
  - Added `blob_nonce` column to users table

### Shared
- 📝 `shared/src/types/index.ts`
  - Added optional `encrypted_blob_key` field to User type
  - Added optional `blob_nonce` field to User type

## How It Works

### 1. Registration (One-Time Setup)
```typescript
// Generate PRF salt (32 bytes)
const prfSalt = crypto.getRandomValues(new Uint8Array(32));

// Add to registration options
optionsJSON.extensions = {
  prf: {
    eval: { first: prfSalt }
  }
};

// User registers passkey with PRF enabled
```

### 2. Authentication + Key Derivation
```typescript
// Authenticate with PRF extension
const authResponse = await startAuthentication({ optionsJSON });

// Extract PRF output (32 bytes of high-entropy data)
const prfOutput = authResponse.clientExtensionResults.prf.results.first;

// Derive AES-GCM encryption key using HKDF
const encryptionKey = await crypto.subtle.deriveKey(
  { name: "HKDF", hash: "SHA-256", salt, info },
  prfOutput,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt", "decrypt"]
);
```

### 3. Encryption
```typescript
// Generate random blob (1KB)
const randomBlob = crypto.getRandomValues(new Uint8Array(1024));

// Generate unique nonce (12 bytes)
const nonce = crypto.getRandomValues(new Uint8Array(12));

// Encrypt using AES-GCM
const encryptedData = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv: nonce },
  encryptionKey,
  randomBlob
);

// Store in R2 with nonce
```

### 4. Decryption
```typescript
// Authenticate again (get same PRF output)
// Derive same encryption key
// Retrieve encrypted blob + nonce from R2/D1

// Decrypt
const decryptedData = await crypto.subtle.decrypt(
  { name: "AES-GCM", iv: nonce },
  encryptionKey,
  encryptedData
);
```

## User Flow

### First Time User
1. **Register**: Enter username → Click "Register Passkey" → Complete biometric auth
2. **Authenticate**: Click "Authenticate with Passkey" → Complete biometric auth
3. **Encrypt**: Click "Generate & Encrypt Random Blob" → Blob stored in R2
4. **Decrypt**: Click "Retrieve & Decrypt Blob" → Blob decrypted and displayed

### Returning User
1. **Authenticate**: Complete biometric auth → PRF key available
2. **Decrypt**: Click "Retrieve & Decrypt Blob" → Access stored data

## Security Model

### What's Protected
✅ Blob data is encrypted client-side before transmission
✅ Encryption key derived from authenticator (never leaves device)
✅ Origin-bound via WebAuthn (phishing-resistant)
✅ Requires biometric/PIN authentication

### What's Not Protected
⚠️ Nonce is stored in plaintext (OK - nonces don't need to be secret)
⚠️ R2 key is stored in plaintext (OK - identifies encrypted blob)
⚠️ PRF salt is in memory (session-based, not persisted)

### Critical Warnings
🚨 **Deleting passkey = permanent data loss** (no recovery mechanism)
🚨 **PRF salt must remain constant** (changing salt = different key)
🚨 **Authenticator dependency** (must support PRF extension)

## Browser/Authenticator Support

### ✅ Supported
- Chrome 108+ with Touch ID (macOS)
- Chrome 108+ with Face ID (iOS)
- Chrome 108+ with Windows Hello
- Edge 108+ with platform authenticators
- Safari 16.4+ with Touch ID (macOS)

### ❌ Not Supported
- External security keys (most don't support PRF)
- Older browsers (Chrome <108, Safari <16.4)
- Firefox (limited WebAuthn Level 3 support)

## Next Steps

### For Development
1. Follow `SETUP.md` to configure Cloudflare services
2. Run database migration
3. Test the complete flow
4. Verify PRF extension works on your authenticator

### For Production

**Before Deploying:**
1. ✅ Run database migration on production D1
2. ✅ Update `rpID` and `origin` in server code
3. ✅ Configure production R2 bucket
4. ✅ Update client environment variables
5. ✅ Add user warnings about data loss
6. ✅ Implement salt persistence strategy

**Recommended Enhancements:**
- [ ] Persist PRF salt (derive from passphrase or store securely)
- [ ] Add multiple blob support per user
- [ ] Implement file upload instead of random data
- [ ] Add backup/recovery mechanism
- [ ] Rate limiting on R2 operations
- [ ] Blob size limits and quotas
- [ ] User consent for data encryption
- [ ] Error handling improvements

### For Customization

**Replace Random Blob with Real Data:**

Current implementation:
```typescript
const randomBlob = generateRandomBlob(1024); // Random data
```

Your use case might be:
```typescript
// Example 1: Encrypt user secrets
const userSecrets = new TextEncoder().encode(JSON.stringify({
  apiKey: "secret",
  privateData: "confidential"
}));

// Example 2: Encrypt uploaded file
const fileData = await file.arrayBuffer();
const fileBytes = new Uint8Array(fileData);

// Then encrypt as normal
const encrypted = await encryptData(key, fileBytes, nonce);
```

## Testing Checklist

- [ ] Register new passkey
- [ ] Authenticate and see "PRF encryption key available"
- [ ] Generate and encrypt blob
- [ ] See success message with R2 key
- [ ] Retrieve and decrypt blob
- [ ] Verify decrypted data matches (check preview)
- [ ] Logout and re-authenticate
- [ ] Decrypt blob again (should work with same key)
- [ ] Test on different devices (if using multi-device passkeys)

## Troubleshooting

### "PRF extension not available"
→ Authenticator doesn't support PRF. Use platform authenticator (Touch ID, Face ID, Windows Hello).

### "Blob not found"
→ Encrypt data first before trying to decrypt.

### "Decryption failed"
→ PRF salt may have changed. Ensure salt is consistent across sessions.

### R2/D1 errors
→ Check wrangler.toml bindings and Cloudflare dashboard.

## References

- [Original Blog Post](https://blog.millerti.me/2023/01/22/encrypting-data-in-the-browser-using-webauthn/)
- [WebAuthn Level 3 Spec](https://w3c.github.io/webauthn/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

## Questions?

See detailed documentation:
- Technical details → `PRF_IMPLEMENTATION.md`
- Setup instructions → `SETUP.md`
- Code → `client/src/crypto.ts`, `client/src/App.tsx`, `server/src/index.ts`
