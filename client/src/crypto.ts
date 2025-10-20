/**
 * Crypto utilities for PRF-based encryption/decryption using Web Crypto API
 * Based on https://blog.millerti.me/2023/01/22/encrypting-data-in-the-browser-using-webauthn/
 */

/**
 * Generate a random 32-byte salt for PRF extension
 */
export function generatePrfSalt(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Generate a random 12-byte nonce for AES-GCM encryption
 */
export function generateNonce(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Convert Uint8Array to Base64URL string for storage/transmission
 */
export function uint8ArrayToBase64Url(array: Uint8Array): string {
	const base64 = btoa(String.fromCharCode(...array));
	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Convert Base64URL string back to Uint8Array
 */
export function base64UrlToUint8Array(base64url: string): Uint8Array {
	const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64.padEnd(
		base64.length + ((4 - (base64.length % 4)) % 4),
		"=",
	);
	const binary = atob(padded);
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Derive an AES-GCM encryption key from PRF output using HKDF
 * @param prfOutput - The output from the PRF extension (32 bytes)
 * @param salt - Additional salt for HKDF (optional, but recommended)
 * @returns AES-GCM 256-bit encryption key
 */
export async function deriveEncryptionKey(
	prfOutput: ArrayBuffer,
	salt: Uint8Array = new Uint8Array(32), // Default to empty salt if none provided
): Promise<CryptoKey> {
	// Import PRF output as key derivation key material
	const inputKeyMaterial = await crypto.subtle.importKey(
		"raw",
		prfOutput,
		"HKDF",
		false,
		["deriveKey"],
	);

	// Derive AES-GCM key using HKDF
	const encryptionKey = await crypto.subtle.deriveKey(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: salt,
			info: new Uint8Array(), // Optional context/application-specific info
		},
		inputKeyMaterial,
		{
			name: "AES-GCM",
			length: 256,
		},
		false, // Not extractable for security
		["encrypt", "decrypt"],
	);

	return encryptionKey;
}

/**
 * Encrypt data using AES-GCM with derived key
 * @param key - The AES-GCM encryption key
 * @param data - Data to encrypt (Uint8Array)
 * @param nonce - 12-byte nonce (must be unique per encryption)
 * @returns Encrypted ciphertext
 */
export async function encryptData(
	key: CryptoKey,
	data: Uint8Array,
	nonce: Uint8Array,
): Promise<ArrayBuffer> {
	return await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv: nonce,
		},
		key,
		data,
	);
}

/**
 * Decrypt data using AES-GCM with derived key
 * @param key - The AES-GCM encryption key
 * @param ciphertext - Encrypted data
 * @param nonce - The same 12-byte nonce used during encryption
 * @returns Decrypted plaintext
 */
export async function decryptData(
	key: CryptoKey,
	ciphertext: ArrayBuffer,
	nonce: Uint8Array,
): Promise<ArrayBuffer> {
	return await crypto.subtle.decrypt(
		{
			name: "AES-GCM",
			iv: nonce,
		},
		key,
		ciphertext,
	);
}

/**
 * Generate random blob data (for testing purposes)
 * @param sizeInBytes - Size of the random blob
 * @returns Random Uint8Array
 */
export function generateRandomBlob(sizeInBytes: number): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(sizeInBytes));
}
