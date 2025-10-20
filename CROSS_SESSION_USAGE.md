# Cross-Session Encrypted Message Retrieval

## Overview

Users can now **encrypt a message in one session and decrypt it in a completely new session** after logging out and back in!

## What Was Fixed

### The Problem
- User encrypts message → Logs out → Logs back in
- App didn't know user had an encrypted message stored
- No decrypt button shown
- User couldn't access their encrypted data ❌

### The Solution
- Added `POST /check-blob` endpoint to check if user has encrypted data
- On authentication, automatically check for existing encrypted messages
- Show decrypt button and helpful message if blob exists
- User can immediately decrypt their stored message ✅

## User Flow

### Session 1: Encrypt Message

```
1. Register passkey (first time only)
2. Authenticate with passkey
3. Type message: "My secret data"
4. Click "Encrypt & Store Message"
5. Message encrypted and stored in R2
6. Logout
7. Close browser
```

### Session 2: Decrypt Message (Next Day)

```
1. Open browser (fresh session)
2. Enter username
3. Click "Authenticate with Passkey"
4. ✅ App checks for existing encrypted blob
5. ✅ Shows message: "You have an encrypted message stored"
6. ✅ Shows yellow box: "📦 Encrypted Message Stored"
7. ✅ Shows "Retrieve & Decrypt Message" button
8. Click "Retrieve & Decrypt Message"
9. ✅ See original message: "My secret data"
```

## What You'll See

### After Login (No Existing Message)
```
┌────────────────────────────────────────┐
│ PRF Encryption Available               │
├────────────────────────────────────────┤
│ Your Secret Message                    │
│ ┌────────────────────────────────────┐ │
│ │ [Enter message to encrypt...]      │ │
│ └────────────────────────────────────┘ │
│                                        │
│ [Encrypt & Store Message]             │
└────────────────────────────────────────┘
```

### After Login (Existing Message Found!)
```
┌────────────────────────────────────────┐
│ PRF Encryption Available               │
├────────────────────────────────────────┤
│ 📦 Encrypted Message Stored            │
│ You have an encrypted message in       │
│ storage. Click the button below to     │
│ decrypt and view it.                   │
│                                        │
│ [Retrieve & Decrypt Message]           │
└────────────────────────────────────────┘
```

### After Decrypting
```
┌────────────────────────────────────────┐
│ PRF Encryption Available               │
├────────────────────────────────────────┤
│ 📦 Encrypted Message Stored            │
├────────────────────────────────────────┤
│ Decrypted Message:                     │
│ ┌────────────────────────────────────┐ │
│ │ My secret data                     │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

## Technical Implementation

### Server Endpoint (`server/src/index.ts`)

```typescript
// Check if user has encrypted blob
app.post("/check-blob", async (c) => {
  const { username } = await c.req.json();
  const user = await getUser(c.env.DB, username);
  
  const blobRef = await getUserBlobReference(c.env.DB, user.id);
  const hasBlob = !!(blobRef && blobRef.encrypted_blob_key);
  
  return c.json({ hasBlob });
});
```

### Client Authentication (`client/src/App.tsx:200`)

```typescript
if (verification.verified) {
  setIsAuthenticated(true);
  
  if (authResponse.clientExtensionResults?.prf?.results?.first) {
    const prfResult = authResponse.clientExtensionResults.prf.results.first;
    setPrfOutput(prfResult);
    
    // 🔍 Check if user has existing encrypted blob
    const blobCheckResponse = await fetch(`${SERVER_URL}/check-blob`, {
      method: "POST",
      body: JSON.stringify({ username }),
    });
    
    const blobData = await blobCheckResponse.json();
    if (blobData.hasBlob) {
      setHasBlob(true); // ✅ Show decrypt button!
      setMessage(
        `You have an encrypted message stored. Click "Retrieve & Decrypt" to view it.`
      );
    }
  }
}
```

### Client UI (`client/src/App.tsx:452`)

```typescript
{/* Show yellow notification box when blob exists */}
{hasBlob && !decryptedMessage && (
  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
    <p className="text-yellow-900 text-sm font-semibold mb-1">
      📦 Encrypted Message Stored
    </p>
    <p className="text-yellow-700 text-xs">
      You have an encrypted message in storage. Click the button below to decrypt and view it.
    </p>
  </div>
)}

{/* Hide message input if blob already exists */}
{!hasBlob && (
  <div className="flex flex-col gap-2">
    <textarea
      placeholder="Enter a message to encrypt..."
      value={userMessage}
      onChange={(e) => setUserMessage(e.target.value)}
    />
  </div>
)}
```

## State Management

### Blob State Lifecycle

```
Initial State:
  hasBlob: false
  decryptedMessage: ""
  encryptedMessage: ""

After Authentication (with existing blob):
  ✅ /check-blob called
  ✅ hasBlob: true
  ✅ Shows decrypt button
  ✅ Shows yellow notification

After Clicking Decrypt:
  ✅ /retrieve-blob called
  ✅ decryptedMessage: "Your message"
  ✅ Shows green decrypted box
  ✅ Hides yellow notification
```

## Database Schema

### Users Table
```sql
users:
  - prf_salt TEXT              -- PRF salt for encryption key
  - encrypted_blob_key TEXT    -- R2 object key (e.g., "user-123-blob")
  - blob_nonce TEXT            -- Nonce used for encryption
```

**Check Logic**:
```sql
SELECT encrypted_blob_key FROM users WHERE id = ?

Result:
  - NULL or empty → hasBlob = false
  - "user-123-blob" → hasBlob = true ✅
```

## Files Modified

- ✅ `server/src/index.ts` - Added `/check-blob` endpoint
- ✅ `client/src/App.tsx` - Check for blob on authentication, updated UI

## Testing

### Test Script

**Day 1:**
```
1. Register user "alice"
2. Authenticate
3. Type: "Secret message from Day 1"
4. Encrypt & Store
5. Logout
6. Close browser
```

**Day 2:**
```
1. Open browser
2. Login as "alice"
3. ✅ Should see: "You have an encrypted message stored"
4. ✅ Should see: Yellow box with 📦 icon
5. ✅ Should see: "Retrieve & Decrypt Message" button
6. Click decrypt
7. ✅ Should see: "Secret message from Day 1"
```

### Debug Checklist

If decrypt button doesn't appear:

- [ ] Check browser console for errors
- [ ] Verify `/check-blob` endpoint returns `{ hasBlob: true }`
- [ ] Check database: `SELECT encrypted_blob_key FROM users WHERE username = 'alice'`
- [ ] Ensure PRF salt exists in database
- [ ] Verify R2 bucket has blob stored

## Security Notes

### What `/check-blob` Returns

```json
{
  "hasBlob": true  // or false
}
```

**Not Returned** (for security):
- Encrypted blob content
- Nonce
- PRF salt
- Blob size or metadata

User must authenticate to decrypt - checking existence is safe.

## Use Cases

### Personal Password Manager
```
Day 1: Store encrypted API keys
Day 30: Retrieve API keys for deployment
```

### Secure Notes
```
Week 1: Encrypt personal notes
Week 52: Decrypt and review notes
```

### Cross-Device Access
```
Device A: Encrypt document
Device B: Login with synced passkey → Decrypt document
```

## Limitations

1. **One Blob Per User**: Current implementation allows one encrypted message
2. **No Preview**: Must decrypt to see content (intentional for security)
3. **No Blob List**: Can't see metadata (when encrypted, size, etc.)

## Future Enhancements

### Multiple Messages
```typescript
// Support array of encrypted blobs
const blobs = await getUserBlobs(userId);
return c.json({ 
  hasBlob: blobs.length > 0,
  count: blobs.length,
  // Don't return actual blob data
});
```

### Blob Metadata
```typescript
// Return safe metadata (not content)
return c.json({
  hasBlob: true,
  encryptedAt: "2025-01-15T10:30:00Z",
  blobSize: 1024,  // bytes
  // Still don't return content or keys
});
```

### Delete Blob
```typescript
// Allow user to delete encrypted blob and start fresh
async function handleDeleteBlob() {
  await fetch('/delete-blob', { username });
  setHasBlob(false);
  setUserMessage("");
}
```

## Summary

✅ **Cross-session encryption working!**
✅ **Auto-detection of existing encrypted messages**
✅ **Clear UI indicators**
✅ **Seamless user experience**

Users can now:
- Encrypt data once
- Log out completely
- Come back days/weeks/months later
- See their encrypted message is available
- Decrypt with one click

The encryption persists across sessions thanks to:
1. PRF salt stored in database (per user)
2. Blob reference stored in database
3. Automatic blob existence check on login
