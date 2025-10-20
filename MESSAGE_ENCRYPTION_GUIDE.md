# Message Encryption UI Guide

## Updated Features

The app now allows you to encrypt **custom text messages** instead of random blobs!

## User Flow

### 1. Authentication
- Enter username
- Click "Authenticate with Passkey"
- Complete biometric authentication
- See "PRF encryption key available" message

### 2. Encrypt a Message
- **Input Field**: Enter your secret message in the textarea
- **Encrypted Display**: After clicking "Encrypt & Store Message", see the Base64-encoded encrypted version
- **Storage**: Message is stored encrypted in Cloudflare R2

### 3. Decrypt the Message
- Click "Retrieve & Decrypt Message"
- **Decrypted Display**: See your original message decrypted and displayed

## UI Components

### Message Input
```
┌─────────────────────────────────────┐
│ Your Secret Message                 │
│ ┌─────────────────────────────────┐ │
│ │ Enter a message to encrypt...   │ │
│ │                                 │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Encrypted Message Display
```
┌─────────────────────────────────────┐
│ Encrypted Message (Base64):         │
│ ┌─────────────────────────────────┐ │
│ │ aGVsbG8gd29ybGQ=...             │ │
│ └─────────────────────────────────┘ │
│ Length: 256 characters              │
└─────────────────────────────────────┘
```

### Decrypted Message Display
```
┌─────────────────────────────────────┐
│ Decrypted Message:                  │
│ ┌─────────────────────────────────┐ │
│ │ Your original message here!     │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## Example Use Cases

### 1. Personal Notes
```
Input: "Remember to buy milk and eggs tomorrow"
Encrypted: "dGhpcyBpcyBlbmNyeXB0ZWQ..."
Decrypted: "Remember to buy milk and eggs tomorrow"
```

### 2. Passwords/Secrets
```
Input: "API Key: sk_live_abc123xyz789"
Encrypted: "YXBpIGtleSBoZXJl..."
Decrypted: "API Key: sk_live_abc123xyz789"
```

### 3. Multi-line Messages
```
Input: 
"Line 1: First secret
Line 2: Second secret
Line 3: Third secret"

Encrypted: "bXVsdGlsaW5lIG1lc3NhZ2U..."
Decrypted: (preserves line breaks)
"Line 1: First secret
Line 2: Second secret
Line 3: Third secret"
```

## Visual State Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Initial State                           │
│  - User authenticates                                       │
│  - PRF encryption available                                 │
│  - Empty message input                                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 User Types Message                          │
│  - Textarea shows user input                                │
│  - "Encrypt & Store Message" button enabled                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Click "Encrypt & Store Message"                │
│  - Message converted to bytes                               │
│  - AES-GCM encryption applied                               │
│  - Encrypted message displayed (Base64)                     │
│  - Stored in R2                                             │
│  - Input field disabled                                     │
│  - "Retrieve & Decrypt Message" button appears              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│           Click "Retrieve & Decrypt Message"                │
│  - Fetches encrypted message from R2                        │
│  - Decrypts using same PRF-derived key                      │
│  - Original message displayed                               │
│  - User can verify message matches original                 │
└─────────────────────────────────────────────────────────────┘
```

## Technical Details

### Encryption Process
1. **User Input** → UTF-8 encoded to bytes
2. **PRF Output** (32 bytes) → HKDF → AES-GCM 256-bit key
3. **Encrypt** → AES-GCM with unique nonce
4. **Encode** → Base64 for display/transmission
5. **Store** → R2 bucket + nonce in D1

### Decryption Process
1. **Authenticate** → Get same PRF output
2. **Fetch** → Retrieve encrypted message + nonce
3. **Derive** → Same AES-GCM key from PRF
4. **Decrypt** → AES-GCM decryption
5. **Decode** → UTF-8 bytes to string
6. **Display** → Original message

## Security Features

✅ **Client-Side Encryption**: Message never leaves browser unencrypted
✅ **Phishing-Resistant**: Keys bound to your domain via WebAuthn
✅ **No Password**: Uses biometric/device authentication
✅ **Deterministic**: Same passkey always produces same key

## Limitations

⚠️ **One Message Per User**: Current implementation allows one encrypted message
⚠️ **No Edit**: Must logout/reset to encrypt a new message
⚠️ **Passkey Dependency**: Deleting passkey = permanent data loss

## Color Coding

- **Blue** (`bg-blue-50`): PRF encryption panel
- **Purple** (`bg-purple-50`): Encrypted message display
- **Green** (`bg-green-50`): Decrypted message display
- **Red** (`bg-red-600`): Logout button

## Accessibility

- ✅ Label for textarea (`htmlFor="userMessage"`)
- ✅ Placeholder text for guidance
- ✅ Disabled state when message already stored
- ✅ Button disabled when no message entered
- ✅ Visual feedback via color-coded sections

## Testing Checklist

- [ ] Authenticate with passkey
- [ ] See PRF encryption panel
- [ ] Type a message in textarea
- [ ] Button enabled when message has content
- [ ] Click "Encrypt & Store Message"
- [ ] See encrypted Base64 string displayed
- [ ] See success message
- [ ] Textarea becomes disabled
- [ ] "Retrieve & Decrypt Message" button appears
- [ ] Click decrypt button
- [ ] Original message appears in green box
- [ ] Message matches what you typed
- [ ] Logout clears all fields

## Next Steps

### Enhance with Multiple Messages
```typescript
// Store messages as array in R2
const messages = [
  { id: 1, text: "First message", timestamp: "..." },
  { id: 2, text: "Second message", timestamp: "..." }
];
```

### Add Delete Functionality
```typescript
// Clear current message and allow new encryption
function handleClearMessage() {
  setHasBlob(false);
  setEncryptedMessage("");
  setDecryptedMessage("");
  setUserMessage("");
}
```

### File Upload Support
```typescript
// Encrypt files instead of text
async function handleFileEncrypt(file: File) {
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  // ... encrypt and store
}
```
