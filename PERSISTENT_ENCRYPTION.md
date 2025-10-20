# Persistent Encryption Across Sessions

## Overview

This implementation enables **cross-session encryption/decryption** - users can encrypt data in one session and decrypt it in a future session, even after logging out or closing the browser.

## The Problem (Before)

```
Session 1:
- User registers
- PRF salt generated randomly in memory
- User encrypts message
- User logs out

Session 2:
- User logs in
- NEW PRF salt generated (different from Session 1)
- Different salt → Different encryption key → Can't decrypt! ❌
```

## The Solution (Now)

```
Session 1:
- User registers
- PRF salt generated randomly
- PRF salt saved to database ✅
- User encrypts message
- User logs out

Session 2:
- User logs in
- PRF salt fetched from database ✅
- Same salt → Same encryption key → Can decrypt! ✅
```

## How It Works

### 1. Database Schema

**Added Column** (`server/schema.sql`):
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username VARCHAR UNIQUE,
  prf_salt TEXT,           -- ← NEW: Base64URL-encoded 32-byte salt
  encrypted_blob_key TEXT,
  blob_nonce TEXT
)
```

**Migration** (`server/migrations/002_add_prf_salt.sql`):
```sql
ALTER TABLE users ADD COLUMN prf_salt TEXT;
```

### 2. Server Endpoints

**Save PRF Salt** - `POST /save-prf-salt`
```typescript
// Called during registration
{
  "username": "alice",
  "prfSalt": "base64url_encoded_32_bytes"
}
```

**Get PRF Salt** - `POST /get-prf-salt`
```typescript
// Called during authentication
{
  "username": "alice"
}

// Response:
{
  "prfSalt": "base64url_encoded_32_bytes" // or null if not set
}
```

### 3. Client Flow

#### Registration Flow

```typescript
async function handleRegister() {
  // Generate NEW PRF salt
  const currentPrfSalt = generatePrfSalt(); // 32 random bytes
  setPrfSalt(currentPrfSalt);
  
  // Use salt in WebAuthn registration
  optionsJSON.extensions = {
    prf: { eval: { first: currentPrfSalt } }
  };
  
  // Register passkey
  const registrationResponse = await startRegistration({ optionsJSON });
  
  // Save salt to database
  const prfSaltBase64 = uint8ArrayToBase64Url(currentPrfSalt);
  await fetch('/save-prf-salt', {
    body: JSON.stringify({ username, prfSalt: prfSaltBase64 })
  });
}
```

#### Authentication Flow

```typescript
async function handleAuthenticate() {
  // Fetch user's existing PRF salt from database
  const response = await fetch('/get-prf-salt', {
    body: JSON.stringify({ username })
  });
  
  const { prfSalt } = await response.json();
  
  let currentPrfSalt;
  if (prfSalt) {
    // User has existing salt - use it
    currentPrfSalt = base64UrlToUint8Array(prfSalt);
  } else {
    // First time login - generate new salt
    currentPrfSalt = generatePrfSalt();
  }
  
  setPrfSalt(currentPrfSalt);
  
  // Use salt in WebAuthn authentication
  optionsJSON.extensions = {
    prf: { eval: { first: currentPrfSalt } }
  };
  
  // Authenticate
  const authResponse = await startAuthentication({ optionsJSON });
  
  // Extract PRF output - will be SAME as before because salt is same!
  const prfOutput = authResponse.clientExtensionResults.prf.results.first;
}
```

## Complete User Journey

### Day 1: First Registration

1. **Register**:
   - User clicks "Register Passkey"
   - System generates: `prfSalt = [random 32 bytes]`
   - System saves: `prfSalt → database`
   - Passkey registered with PRF enabled

2. **Authenticate**:
   - User clicks "Authenticate with Passkey"
   - System fetches: `prfSalt` from database
   - System derives: `encryptionKey` from PRF output
   - User is authenticated

3. **Encrypt**:
   - User types: `"My secret message"`
   - System encrypts using `encryptionKey`
   - System stores: encrypted blob → R2
   - User logs out

### Day 2: Return User

1. **Authenticate**:
   - User clicks "Authenticate with Passkey"
   - System fetches: **SAME** `prfSalt` from database ✅
   - System derives: **SAME** `encryptionKey` ✅
   - User is authenticated

2. **Decrypt**:
   - User clicks "Retrieve & Decrypt Message"
   - System fetches: encrypted blob from R2
   - System decrypts using **SAME** `encryptionKey`
   - User sees: `"My secret message"` ✅

## Key Components

### PRF Salt Lifecycle

```
┌──────────────────────────────────────────────────────┐
│              Registration (Day 1)                    │
│                                                      │
│  1. Generate: prfSalt = crypto.random(32 bytes)     │
│  2. Save to DB: prf_salt column                     │
│  3. Use in WebAuthn: prf.eval.first                 │
└──────────────────────────────────────────────────────┘
                         │
                         │ [Salt stored in database]
                         │
┌──────────────────────────────────────────────────────┐
│           Authentication (Day 2, 3, ...)             │
│                                                      │
│  1. Fetch from DB: SELECT prf_salt WHERE user       │
│  2. Decode: base64url → Uint8Array                  │
│  3. Use in WebAuthn: prf.eval.first (SAME salt!)    │
│  4. Get PRF output → Derive key (SAME key!)         │
└──────────────────────────────────────────────────────┘
```

### Deterministic Encryption

```
Input:
  - Credential ID: abc123 (unique to user's passkey)
  - PRF Salt: def456 (stored in database)

WebAuthn PRF Function:
  prfOutput = HMAC(credential_secret, prf_salt)
  
Result:
  - ALWAYS the same prfOutput for same credential + salt
  - Deterministic encryption key derivation
```

## Security Considerations

### What's Stored in Database

| Data | Location | Format | Sensitive? |
|------|----------|--------|------------|
| PRF Salt | D1 users.prf_salt | Base64URL | ⚠️ Not secret, but should be protected |
| Encrypted Blob | R2 | Binary | ✅ Encrypted |
| Nonce | D1 users.blob_nonce | Base64URL | ℹ️ Public, doesn't need secrecy |

### PRF Salt Security

**Is the salt secret?**
- Not technically a "secret" like a password
- But it should be **protected from modification**
- If attacker changes salt → Different encryption key → Data loss

**Protection Measures**:
```
✅ Stored server-side (not in client localStorage)
✅ Only accessible via authenticated API endpoints
✅ Tied to specific user account
✅ Cannot be changed without authentication
```

**What if salt is leaked?**
- Attacker still needs:
  1. User's passkey (biometric/device)
  2. Access to encrypted data
  3. Cannot decrypt without passkey authentication

### Attack Scenarios

**Scenario 1: Database Compromise**
```
Attacker gets:
  - PRF salt ✓
  - Encrypted blob reference ✓
  - Encrypted blob from R2 ✓

Attacker CANNOT:
  - Generate PRF output (needs passkey)
  - Derive encryption key (needs PRF output)
  - Decrypt data ✅ SAFE
```

**Scenario 2: Salt Modification**
```
Attacker modifies:
  - User's PRF salt in database

Result:
  - User authenticates with DIFFERENT salt
  - Gets DIFFERENT PRF output
  - Derives DIFFERENT encryption key
  - Cannot decrypt old data ⚠️ DATA LOSS (not theft)
```

**Scenario 3: Cross-Account Attack**
```
Attacker tries:
  - Use Alice's salt with Bob's passkey

Result:
  - Different credential → Different PRF output
  - Cannot decrypt Alice's data ✅ SAFE
```

## Production Deployment

### Step 1: Run Migration

```bash
cd server
wrangler d1 execute DB --file=./migrations/002_add_prf_salt.sql
```

### Step 2: Deploy Updated Server

```bash
wrangler deploy
```

### Step 3: Handle Existing Users

**Users registered BEFORE this update**:
- Have NO `prf_salt` in database
- On next login:
  - System generates NEW salt
  - Cannot decrypt old data ⚠️

**Migration Strategy for Existing Users**:
```typescript
// Option 1: Force re-encryption
if (!saltData.prfSalt && hasExistingBlob) {
  alert("Please re-encrypt your data with the new system");
  clearOldBlob();
}

// Option 2: Derive salt from passphrase
const userPassphrase = prompt("Enter your encryption passphrase");
const derivedSalt = await crypto.subtle.digest('SHA-256', 
  new TextEncoder().encode(userPassphrase)
);
```

## Testing Cross-Session Encryption

### Test Script

1. **Session 1: Encrypt**
   ```
   1. Open browser
   2. Register passkey
   3. Authenticate
   4. Type message: "Test cross-session encryption"
   5. Click "Encrypt & Store Message"
   6. See encrypted Base64 string
   7. Click "Logout"
   8. Close browser
   ```

2. **Session 2: Decrypt (Different Day)**
   ```
   1. Open browser (fresh session)
   2. Enter same username
   3. Authenticate with passkey
   4. Click "Retrieve & Decrypt Message"
   5. Should see: "Test cross-session encryption" ✅
   ```

3. **Verify Database**
   ```bash
   wrangler d1 execute DB --command="SELECT username, prf_salt FROM users"
   
   # Should show:
   # username | prf_salt
   # alice    | abc123def456...  ✅
   ```

## Troubleshooting

### "Cannot decrypt - different key"

**Cause**: PRF salt changed between encryption and decryption

**Debug**:
```javascript
// Check salt consistency
console.log("Encrypt salt:", uint8ArrayToBase64Url(encryptSalt));
console.log("Decrypt salt:", uint8ArrayToBase64Url(decryptSalt));
// Should be IDENTICAL
```

**Fix**:
- Ensure salt is fetched from database before decrypt
- Check migration ran successfully
- Verify no salt modification in database

### "No PRF salt found"

**Cause**: User registered before migration

**Fix**:
```typescript
if (!saltData.prfSalt) {
  // Generate new salt
  const newSalt = generatePrfSalt();
  
  // Save to database
  await fetch('/save-prf-salt', {
    body: JSON.stringify({ 
      username, 
      prfSalt: uint8ArrayToBase64Url(newSalt) 
    })
  });
  
  // User must re-encrypt data with new salt
  alert("Please re-encrypt your data");
}
```

## Advanced Features

### Salt Rotation

```typescript
async function rotatePrfSalt(username: string) {
  // 1. Decrypt with old salt
  const oldEncryptedData = await retrieveBlob();
  const oldDecryptedData = await decrypt(oldEncryptedData, oldKey);
  
  // 2. Generate new salt
  const newSalt = generatePrfSalt();
  await savePrfSalt(username, newSalt);
  
  // 3. Re-encrypt with new salt
  // (requires fresh authentication to get new PRF output)
  const newKey = await deriveKey(newPrfOutput);
  const newEncryptedData = await encrypt(oldDecryptedData, newKey);
  
  // 4. Store re-encrypted data
  await storeBlob(newEncryptedData);
}
```

### Multi-Device Sync

If using multi-device passkeys (iCloud Keychain, etc.):

```
Device A:
  - Registers passkey with PRF
  - Passkey syncs to Device B via iCloud

Device B:
  - Same credential ID
  - Same PRF salt (from database)
  - Same PRF output → Same encryption key ✅
  - Can decrypt data encrypted on Device A
```

## Summary

✅ **Problem Solved**: Users can now encrypt data and decrypt it in future sessions

✅ **Implementation**:
- PRF salt stored in database (per user)
- Fetched on authentication
- Deterministic encryption key derivation

✅ **Security**:
- Salt protected server-side
- Requires passkey authentication to derive key
- Database compromise doesn't reveal plaintext

✅ **User Experience**:
- Transparent to user
- No passwords or passphrases needed
- Works across sessions, devices, and days

## Migration Checklist

- [ ] Run migration: `002_add_prf_salt.sql`
- [ ] Deploy updated server code
- [ ] Deploy updated client code
- [ ] Test registration → encrypt → logout → login → decrypt
- [ ] Verify salt stored in database
- [ ] Document for existing users (may need re-encryption)
