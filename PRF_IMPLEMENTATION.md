# WebAuthn PRF (Pseudo-Random Function) Implementation

This document describes the implementation of PRF-based encryption in the WebAuthn authentication app, based on [this blog post](https://blog.millerti.me/2023/01/22/encrypting-data-in-the-browser-using-webauthn/).

## Overview

The PRF extension enables authenticators to generate deterministic cryptographic material that can be used for client-side encryption. The same credential and PRF salt will always produce the same output, allowing for secure, phishing-resistant encryption without passwords.

## Architecture

### Flow Diagram

```
Registration:
1. Client generates PRF salt (32 bytes)
2. Client requests registration options from server
3. Client adds PRF extension to options
4. User registers passkey with PRF enabled
5. Authenticator stores PRF capability

Authentication + Encryption:
1. Client requests authentication options
2. Client adds PRF extension with salt
3. User authenticates with passkey
4. Authenticator returns PRF output (32 bytes)
5. Client derives AES-GCM key using HKDF
6. Client encrypts random blob
7. Client sends encrypted blob to server
8. Server stores in R2, saves reference in D1

Decryption:
1. User authenticates (gets PRF output)
2. Client retrieves encrypted blob from server
3. Server fetches from R2 and returns with nonce
4. Client derives same AES-GCM key using HKDF
5. Client decrypts blob
```

## Implementation Details

### 1. Client-Side Crypto Utilities

**File**: `client/src/crypto.ts`

Key functions:
- `generatePrfSalt()` - Generate 32-byte salt for PRF
- `generateNonce()` - Generate 12-byte nonce for AES-GCM
- `deriveEncryptionKey()` - Use HKDF to derive AES-GCM key from PRF output
- `encryptData()` - Encrypt data using AES-GCM
- `decryptData()` - Decrypt data using AES-GCM
- `generateRandomBlob()` - Generate random test data

### 2. Server-Side Changes

**File**: `server/src/index.ts`

New endpoints:
- `POST /store-blob` - Store encrypted blob in R2
- `POST /retrieve-blob` - Retrieve encrypted blob from R2

Modified endpoints:
- `POST /generate-registration-options` - Added `prf: {}` to extensions
- `POST /generate-authentication-options` - Added `prf: {}` to extensions

**File**: `server/src/db.ts`

New functions:
- `saveUserBlobReference()` - Save R2 key and nonce in D1
- `getUserBlobReference()` - Retrieve blob metadata

### 3. Database Schema

**File**: `server/schema.sql`

Added columns to `users` table:
- `encrypted_blob_key` (TEXT) - R2 object key
- `blob_nonce` (TEXT) - Nonce used for encryption

**Migration**: `server/migrations/001_add_blob_columns.sql`

### 4. Client Application

**File**: `client/src/App.tsx`

Key changes:
- PRF salt generation and storage in module scope
- PRF extension added to registration/authentication flows
- Capture PRF output from `clientExtensionResults`
- New functions: `handleEncryptAndStore()`, `handleRetrieveAndDecrypt()`
- UI for encryption/decryption when PRF is available

## Security Considerations

### Strengths

1. **Phishing Resistance** - Keys are origin-bound via WebAuthn
2. **No Password Storage** - Encryption key derived from authenticator
3. **Deterministic** - Same credential + salt = same key
4. **User Verification** - Biometric/PIN required

### Important Notes

1. **PRF Salt Storage** - Currently stored in module scope (memory). In production:
   - Could be derived from user input
   - Could be stored in secure storage
   - Should NOT change or data becomes unrecoverable

2. **Nonce Management** - Must be unique per encryption operation
   - Stored in database alongside blob reference
   - Required for decryption

3. **Data Loss Risk** - Deleting the passkey = permanent data loss
   - User should be warned
   - Consider backup mechanisms

4. **Browser Compatibility** - PRF extension requires:
   - WebAuthn Level 3 support
   - Authenticator with PRF capability
   - Modern browsers (Chrome 108+, Edge 108+)

## Usage Instructions

### For Existing Databases

1. Run the migration:
```bash
wrangler d1 execute DB --file=./server/migrations/001_add_blob_columns.sql
```

2. Deploy the updated server code

### Testing the Feature

1. **Register a new passkey**:
   - Enter username
   - Click "Register Passkey"
   - Complete biometric/security key authentication

2. **Authenticate**:
   - Click "Authenticate with Passkey"
   - Complete authentication
   - Check for "PRF encryption key available" message

3. **Encrypt and Store**:
   - Click "Generate & Encrypt Random Blob"
   - System generates 1KB random data
   - Encrypts using PRF-derived key
   - Stores in R2

4. **Decrypt**:
   - Click "Retrieve & Decrypt Blob"
   - System fetches from R2
   - Decrypts using same PRF-derived key
   - Displays preview

### Browser Console Debugging

Check `authResponse.clientExtensionResults.prf`:
```javascript
{
  enabled: true,
  results: {
    first: ArrayBuffer(32) // PRF output
  }
}
```

If `undefined`, the authenticator doesn't support PRF.

## Storage Architecture

### R2 Bucket Structure

```
user-{userId}-blob  → Encrypted blob data (binary)
```

### D1 Database

```sql
users:
  - encrypted_blob_key: "user-123-blob"
  - blob_nonce: "base64url_encoded_nonce"
```

## Limitations

1. **One Blob Per User** - Current implementation allows only one blob
2. **Fixed Salt** - PRF salt is generated once per session
3. **In-Memory Salt** - Salt not persisted across browser refreshes
4. **No Backup** - No key escrow or recovery mechanism

## Future Enhancements

1. **Multiple Blobs** - Support multiple encrypted items per user
2. **Salt Persistence** - Store salt securely or derive from user input
3. **Key Rotation** - Re-encrypt data with new keys
4. **Backup Keys** - Implement key escrow for recovery
5. **File Upload** - Allow users to encrypt their own files
6. **Cross-Device** - Sync encrypted data across devices

## References

- [Blog Post: Encrypting Data with WebAuthn](https://blog.millerti.me/2023/01/22/encrypting-data-in-the-browser-using-webauthn/)
- [WebAuthn Level 3 Spec](https://w3c.github.io/webauthn/)
- [Web Crypto API - HKDF](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey)
- [Web Crypto API - AES-GCM](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt)

## Files Modified

### Server
- `server/src/index.ts` - Added PRF extensions, R2 endpoints
- `server/src/db.ts` - Added blob reference functions
- `server/schema.sql` - Added blob columns
- `server/migrations/001_add_blob_columns.sql` - Migration file

### Client
- `client/src/App.tsx` - Added PRF flows, encryption UI
- `client/src/crypto.ts` - New crypto utilities

### Shared
- `shared/src/types/index.ts` - Added blob fields to User type
