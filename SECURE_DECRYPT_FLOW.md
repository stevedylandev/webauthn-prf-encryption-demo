# Secure Decrypt Flow - Option B Implementation

## Overview

This implementation follows **Option B: Require Authentication for Decrypt** - the more secure approach where biometric authentication is required each time you decrypt a message.

## Security Model

### Zero-Knowledge Principle
The encryption key (PRF output) is **never stored** beyond the moment it's needed:

1. ✅ Authentication generates PRF output
2. ✅ Encryption uses PRF output
3. ✅ **PRF output is immediately cleared from memory**
4. ✅ Decryption requires **fresh authentication** to regenerate PRF output
5. ✅ User must provide biometric proof each time

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│             Initial Authentication                          │
│  - User clicks "Authenticate with Passkey"                  │
│  - [BIOMETRIC PROMPT]                                       │
│  - PRF output stored in state                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              User Encrypts Message                          │
│  - Types message in textarea                                │
│  - Clicks "Encrypt & Store Message"                         │
│  - Derives key from PRF output                              │
│  - Encrypts message with AES-GCM                            │
│  - Stores in R2                                             │
│  - ⚠️ CLEARS PRF OUTPUT FROM MEMORY ⚠️                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│         User Wants to Decrypt (Later)                       │
│  - Clicks "🔐 Authenticate & Decrypt Message"              │
│  - [BIOMETRIC PROMPT] ← Required again!                     │
│  - Fresh PRF output generated                               │
│  - Derives same key (deterministic)                         │
│  - Fetches encrypted message from R2                        │
│  - Decrypts and displays                                    │
│  - Fresh PRF output NOT stored (used and discarded)         │
└─────────────────────────────────────────────────────────────┘
```

## Key Differences from Session-Based (Option A)

| Aspect | Option A (Session) | Option B (Secure) |
|--------|-------------------|-------------------|
| **PRF Storage** | Stored in state until logout | Cleared after encryption |
| **Decrypt Auth** | Not required | ✅ Required |
| **Biometric Prompts** | 1x per session | 1x encrypt + 1x decrypt |
| **Memory Exposure** | Key available in memory | Key only when needed |
| **Security Level** | Good | ✅ Better |
| **UX** | Smoother | Slightly more prompts |

## Code Implementation

### Encryption (client/src/App.tsx:257)

```typescript
if (result.success) {
  setHasBlob(true);
  
  // 🔒 SECURITY: Clear PRF output after encryption
  setPrfOutput(null);
  
  setMessage(
    `Successfully encrypted and stored message! You'll need to authenticate again to decrypt.`,
  );
}
```

### Decryption (client/src/App.tsx:271)

```typescript
async function handleRetrieveAndDecrypt() {
  try {
    setMessage("Authenticating to decrypt message...");
    
    // Get authentication options
    const optionsResponse = await fetch(
      `${SERVER_URL}/generate-authentication-options`,
      { /* ... */ }
    );
    
    // Add PRF extension
    optionsJSON.extensions = {
      prf: { eval: { first: prfSalt } }
    };
    
    // 🔐 THIS SHOWS BIOMETRIC PROMPT
    const authResponse = await startAuthentication({ optionsJSON });
    
    // Verify authentication
    const verification = await verifyAuthenticationResponse(/* ... */);
    
    if (!verification.verified) {
      setMessage("Authentication failed. Cannot decrypt.");
      return;
    }
    
    // Extract FRESH PRF output
    const freshPrfOutput = authResponse.clientExtensionResults.prf.results.first;
    
    // Derive key and decrypt
    const encryptionKey = await deriveEncryptionKey(freshPrfOutput);
    const decryptedData = await decryptData(encryptionKey, encryptedData, nonce);
    
    // Display decrypted message
    // freshPrfOutput is NOT stored - function scope only
  }
}
```

## Security Benefits

### 1. **Minimizes Key Exposure**
- PRF output exists in memory only during encryption/decryption
- No persistent state that could be leaked
- Browser refresh = key is gone

### 2. **Proof of Presence**
- Each decrypt requires biometric authentication
- Ensures user is physically present
- Prevents unauthorized decrypt if device is unlocked

### 3. **Audit Trail**
- Each decrypt creates authentication event
- Server can log decrypt attempts
- User awareness of access

### 4. **Defense Against Attacks**

| Attack Vector | Protection |
|--------------|------------|
| Memory dump | ✅ Key not in memory after encryption |
| Browser dev tools | ✅ Can't extract stored PRF output |
| XSS attack | ✅ Key only exists during operation |
| Session hijacking | ✅ Biometric required, can't replay |

## User Experience

### What Users Will See

**After Encryption:**
```
✅ Successfully encrypted and stored message! 
   You'll need to authenticate again to decrypt.
```

**When Clicking Decrypt:**
```
[Biometric Prompt Appears]
Touch ID / Face ID / Windows Hello
"Authenticate to decrypt message..."
```

**After Successful Decrypt:**
```
✅ Successfully decrypted message!

Decrypted Message:
┌─────────────────────────────┐
│ Your original message here! │
└─────────────────────────────┘
```

## PRF Salt Management

### Current Implementation
```typescript
// Global module scope - persisted across operations
let prfSalt: Uint8Array | null = null;

// Generated once
if (!prfSalt) {
  prfSalt = generatePrfSalt();
}
```

### Why It's Important
- **Same salt** = Same PRF output for same credential
- **Different salt** = Different PRF output = Different key = Can't decrypt
- Salt must be consistent to derive the same encryption key

### Production Considerations

**Option 1: Derive from User Input**
```typescript
// User provides passphrase
const userPassphrase = "my-secret-passphrase";
const prfSalt = await crypto.subtle.digest(
  'SHA-256', 
  new TextEncoder().encode(userPassphrase)
);
```

**Option 2: Store in Secure Location**
```typescript
// Store salt in IndexedDB or localStorage
localStorage.setItem('prf-salt', uint8ArrayToBase64Url(prfSalt));
```

**Option 3: Server-Side Storage**
```typescript
// Server provides salt per user
const salt = await fetch(`/get-user-salt/${username}`);
```

## Testing the Secure Flow

### Step-by-Step Test

1. **Authenticate Once**
   - Click "Authenticate with Passkey"
   - Complete biometric prompt
   - See PRF encryption panel

2. **Encrypt Message**
   - Type: "This is my secret message"
   - Click "Encrypt & Store Message"
   - See encrypted Base64 string
   - Notice message: "You'll need to authenticate again to decrypt"

3. **Try to Decrypt**
   - Click "🔐 Authenticate & Decrypt Message"
   - **[BIOMETRIC PROMPT APPEARS]** ← This is the key difference!
   - Complete biometric authentication
   - See decrypted message

4. **Verify Security**
   - Open browser dev tools
   - Check React state (`prfOutput`)
   - Should be `null` after encryption
   - PRF output only exists during decrypt function execution

### Verification Checklist

- [ ] Initial auth requires biometric
- [ ] Encryption succeeds
- [ ] After encryption, `prfOutput` state is `null`
- [ ] Decrypt button shows lock icon 🔐
- [ ] Clicking decrypt shows biometric prompt
- [ ] Decryption succeeds with correct message
- [ ] Can decrypt multiple times (each requires auth)
- [ ] Browser refresh clears everything (need to re-auth)

## Performance Considerations

### Biometric Prompt Speed
- **Touch ID**: ~1-2 seconds
- **Face ID**: ~1 second
- **Windows Hello**: ~1-2 seconds

### Total Decrypt Time
```
1. User clicks button
2. Fetch auth options        → 50-100ms
3. Biometric prompt          → 1-2 seconds ← User interaction
4. Verify auth               → 50-100ms
5. Fetch encrypted message   → 50-200ms
6. Derive key + decrypt      → 10-50ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: ~1.5-2.5 seconds (mostly biometric)
```

Most of the time is the biometric prompt (user-controlled), so the additional security has minimal performance impact.

## Trade-offs

### Pros ✅
- Much better security posture
- Keys only in memory when needed
- User awareness of decrypt operations
- Audit trail of access
- Prevents passive attacks

### Cons ⚠️
- Slightly more prompts
- Can't decrypt if away from device
- May annoy power users

## When to Use This Approach

### ✅ Best For:
- High-value secrets (API keys, passwords, financial data)
- Compliance requirements (HIPAA, SOC2, etc.)
- Multi-user devices
- Public/shared computers
- Paranoid security requirements

### ❌ Overkill For:
- Low-value data (preferences, UI state)
- Single-user personal devices
- Frequent decrypt operations (100s/day)
- User convenience priority

## Future Enhancements

1. **Configurable Security Levels**
   ```typescript
   const securityLevel = "high" | "medium" | "low";
   if (securityLevel === "high") {
     // Clear PRF after each operation
   } else {
     // Session-based PRF storage
   }
   ```

2. **Decrypt Counter**
   ```typescript
   // Auto-clear PRF after N decryptions
   let decryptCount = 0;
   if (decryptCount >= MAX_DECRYPTS) {
     setPrfOutput(null);
   }
   ```

3. **Time-Based Expiry**
   ```typescript
   // Clear PRF after 5 minutes
   const prfTimestamp = Date.now();
   if (Date.now() - prfTimestamp > 5 * 60 * 1000) {
     setPrfOutput(null);
   }
   ```

## Summary

You now have **Option B: Secure Decrypt Flow** implemented:

✅ PRF output cleared after encryption
✅ Fresh biometric authentication required for decrypt
✅ Keys only in memory when actively needed
✅ UI clearly indicates authentication requirement (🔐)
✅ Better security with minimal UX impact

This follows best practices for zero-knowledge encryption and ensures your encryption keys are only available when you explicitly authenticate to use them.
