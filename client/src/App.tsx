import beaver from "./assets/beaver.svg";
import {
	startRegistration,
	startAuthentication,
} from "@simplewebauthn/browser";
import { useState } from "react";
import {
	generatePrfSalt,
	generateNonce,
	uint8ArrayToBase64Url,
	base64UrlToUint8Array,
	deriveEncryptionKey,
	encryptData,
	decryptData,
} from "./crypto";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:8787";

function App() {
	const [username, setUsername] = useState("stevedylandev");
	const [message, setMessage] = useState("");
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [prfOutput, setPrfOutput] = useState<ArrayBuffer | null>(null);
	const [hasBlob, setHasBlob] = useState(false);
	const [decryptedBlob, setDecryptedBlob] = useState<Uint8Array | null>(null);

	// New state for message encryption
	const [userMessage, setUserMessage] = useState("");
	const [encryptedMessage, setEncryptedMessage] = useState("");
	const [decryptedMessage, setDecryptedMessage] = useState("");

	// PRF salt for encryption - persisted per user in database
	const [prfSalt, setPrfSalt] = useState<Uint8Array | null>(null);

	async function handleRegister() {
		try {
			setMessage("Starting registration...");

			// Generate PRF salt for encryption (or use existing)
			let currentPrfSalt = prfSalt;
			if (!currentPrfSalt) {
				currentPrfSalt = generatePrfSalt();
				setPrfSalt(currentPrfSalt);
			}

			// Get registration options from server
			const optionsResponse = await fetch(
				`${SERVER_URL}/generate-registration-options`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ username }),
				},
			);

			if (!optionsResponse.ok) {
				const error = await optionsResponse.json();
				throw new Error(error.error || "Failed to get registration options");
			}

			const optionsJSON = await optionsResponse.json();

			// Add PRF extension to the options
			optionsJSON.extensions = {
				...optionsJSON.extensions,
				prf: {
					eval: {
						first: currentPrfSalt,
					},
				},
			};

			// Start registration with the browser
			const registrationResponse = await startRegistration({ optionsJSON });

			// Verify registration with server
			const verificationResponse = await fetch(
				`${SERVER_URL}/verify-registration`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						username,
						response: registrationResponse,
					}),
				},
			);

			const verification = await verificationResponse.json();

			if (verification.verified) {
				// Save PRF salt to database for future logins
				const prfSaltBase64 = uint8ArrayToBase64Url(currentPrfSalt);
				await fetch(`${SERVER_URL}/save-prf-salt`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						username,
						prfSalt: prfSaltBase64,
					}),
				});

				setMessage(
					"Registration successful! Your encryption salt has been saved. You can now authenticate and encrypt data.",
				);
			} else {
				setMessage("Registration failed. Please try again.");
			}
		} catch (error) {
			console.error(error);
			setMessage(`Registration error: ${error}`);
		}
	}

	async function handleAuthenticate() {
		try {
			setMessage("Starting authentication...");

			// Fetch user's PRF salt from database
			const saltResponse = await fetch(`${SERVER_URL}/get-prf-salt`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ username }),
			});

			const saltData = await saltResponse.json();
			let currentPrfSalt: Uint8Array;

			if (saltData.prfSalt) {
				// User has existing salt - use it
				currentPrfSalt = base64UrlToUint8Array(saltData.prfSalt);
				setPrfSalt(currentPrfSalt);
			} else {
				// No salt found - generate new one (first time login)
				currentPrfSalt = generatePrfSalt();
				setPrfSalt(currentPrfSalt);
			}

			// Get authentication options from server
			const optionsResponse = await fetch(
				`${SERVER_URL}/generate-authentication-options`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ username }),
				},
			);

			if (!optionsResponse.ok) {
				const error = await optionsResponse.json();
				throw new Error(error.error || "Failed to get authentication options");
			}

			const optionsJSON = await optionsResponse.json();

			// Add PRF extension to get encryption key material
			optionsJSON.extensions = {
				...optionsJSON.extensions,
				prf: {
					eval: {
						first: currentPrfSalt,
					},
				},
			};

			// Start authentication with the browser
			const authResponse = await startAuthentication({ optionsJSON });

			// Verify authentication with server
			const verificationResponse = await fetch(
				`${SERVER_URL}/verify-authentication`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						username,
						response: authResponse,
					}),
				},
			);

			const verification = await verificationResponse.json();

			if (verification.verified) {
				setIsAuthenticated(true);

				// Check if PRF extension was successful
				if (authResponse.clientExtensionResults?.prf?.results?.first) {
					const prfResult =
						authResponse.clientExtensionResults.prf.results.first;
					setPrfOutput(prfResult);

					// Check if user has existing encrypted blob
					const blobCheckResponse = await fetch(`${SERVER_URL}/check-blob`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ username }),
					});

					const blobData = await blobCheckResponse.json();
					if (blobData.hasBlob) {
						setHasBlob(true);
						setMessage(
							`Successfully authenticated as ${username}! You have an encrypted message stored. Click "Retrieve & Decrypt" to view it.`,
						);
					} else {
						setMessage(
							`Successfully authenticated as ${username}! PRF encryption key available.`,
						);
					}
				} else {
					setMessage(
						`Successfully authenticated as ${username}! (Note: PRF extension not available)`,
					);
				}
			} else {
				setMessage("Authentication failed. Please try again.");
			}
		} catch (error) {
			console.error(error);
			setMessage(`Authentication error: ${error}`);
		}
	}

	function handleLogout() {
		setIsAuthenticated(false);
		setPrfOutput(null);
		setHasBlob(false);
		setDecryptedBlob(null);
		setUserMessage("");
		setEncryptedMessage("");
		setDecryptedMessage("");
		setPrfSalt(null); // Clear salt from state (will be fetched on next login)
		setMessage("");
	}

	async function handleEncryptAndStore() {
		if (!prfOutput) {
			setMessage("Please authenticate first to get PRF encryption key.");
			return;
		}

		if (!userMessage.trim()) {
			setMessage("Please enter a message to encrypt.");
			return;
		}

		try {
			setMessage("Encrypting your message...");

			// Convert user message to bytes
			const messageBytes = new TextEncoder().encode(userMessage);

			// Generate nonce for encryption
			const nonce = generateNonce();

			// Derive encryption key from PRF output
			const encryptionKey = await deriveEncryptionKey(prfOutput);

			// Encrypt the message
			const encryptedData = await encryptData(
				encryptionKey,
				messageBytes,
				nonce,
			);

			// Convert to base64 for display and transmission
			const encryptedBase64 = btoa(
				String.fromCharCode(...new Uint8Array(encryptedData)),
			);
			const nonceBase64 = uint8ArrayToBase64Url(nonce);

			// Store encrypted message for display
			setEncryptedMessage(encryptedBase64);

			// Store in R2 via server
			const response = await fetch(`${SERVER_URL}/store-blob`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					username,
					encryptedBlob: encryptedBase64,
					nonce: nonceBase64,
				}),
			});

			const result = await response.json();

			if (result.success) {
				setHasBlob(true);
				setMessage(`Successfully encrypted and stored message in R2!`);
			} else {
				setMessage(`Failed to store message: ${result.error}`);
			}
		} catch (error) {
			console.error(error);
			setMessage(`Encryption error: ${error}`);
		}
	}

	async function handleRetrieveAndDecrypt() {
		if (!prfOutput) {
			setMessage("Please authenticate first to get PRF decryption key.");
			return;
		}

		try {
			setMessage("Retrieving and decrypting message...");

			// Retrieve encrypted blob from R2
			const response = await fetch(`${SERVER_URL}/retrieve-blob`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ username }),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to retrieve message");
			}

			const { encryptedBlob, nonce } = await response.json();

			// Convert from base64
			const encryptedData = Uint8Array.from(atob(encryptedBlob), (c) =>
				c.charCodeAt(0),
			);
			const nonceArray = base64UrlToUint8Array(nonce);

			// Derive encryption key from PRF output
			const encryptionKey = await deriveEncryptionKey(prfOutput);

			// Decrypt the message
			const decryptedData = await decryptData(
				encryptionKey,
				encryptedData,
				nonceArray,
			);

			// Convert decrypted bytes back to string
			const decryptedText = new TextDecoder().decode(decryptedData);

			setDecryptedBlob(new Uint8Array(decryptedData));
			setDecryptedMessage(decryptedText);
			setMessage(`Successfully decrypted message!`);
		} catch (error) {
			console.error(error);
			setMessage(`Decryption error: ${error}`);
		}
	}

	return (
		<div className="max-w-xl mx-auto flex flex-col gap-6 items-center justify-center min-h-screen p-4">
			<a href="https://github.com/stevedylandev/bhvr" target="_blank">
				<img
					src={beaver}
					className="w-16 h-16 cursor-pointer"
					alt="beaver logo"
				/>
			</a>
			<h1 className="text-5xl font-black">WebAuthn Auth</h1>
			<h2 className="text-2xl font-bold">SimpleWebAuthn Demo</h2>
			<p className="text-center">Passwordless authentication using passkeys</p>

			{!isAuthenticated ? (
				<div className="flex flex-col gap-4 w-full max-w-md">
					<div className="flex flex-col gap-2">
						<label htmlFor="username" className="font-semibold">
							Username
						</label>
						<input
							id="username"
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							className="border border-gray-300 rounded-md px-3 py-2"
							placeholder="Enter your username"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<button
							type="button"
							onClick={handleRegister}
							className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
						>
							Register Passkey
						</button>
						<button
							type="button"
							onClick={handleAuthenticate}
							className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
						>
							Authenticate with Passkey
						</button>
					</div>
				</div>
			) : (
				<div className="flex flex-col gap-4 items-center w-full max-w-md">
					<p className="text-xl font-semibold text-green-600">
						Logged in as {username}
					</p>

					{prfOutput && (
						<div className="flex flex-col gap-4 w-full p-4 bg-blue-50 rounded-md">
							<div>
								<h3 className="font-semibold text-blue-900">
									PRF Encryption Available
								</h3>
								<p className="text-sm text-blue-700">
									Your authenticator supports PRF encryption. You can now
									encrypt and store messages securely.
								</p>
							</div>

							{/* Message Input */}
							{!hasBlob && (
								<div className="flex flex-col gap-2">
									<label
										htmlFor="userMessage"
										className="font-semibold text-sm text-blue-900"
									>
										Your Secret Message
									</label>
									<textarea
										id="userMessage"
										value={userMessage}
										onChange={(e) => setUserMessage(e.target.value)}
										className="border border-blue-300 rounded-md px-3 py-2 text-sm min-h-[80px]"
										placeholder="Enter a message to encrypt..."
									/>
								</div>
							)}

							{hasBlob && !decryptedMessage && (
								<div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
									<p className="text-yellow-900 text-sm font-semibold mb-1">
										📦 Encrypted Message Stored
									</p>
									<p className="text-yellow-700 text-xs">
										You have an encrypted message in storage. Click the button
										below to decrypt and view it.
									</p>
								</div>
							)}

							{/* Action Buttons */}
							<div className="flex flex-col gap-2">
								<button
									type="button"
									onClick={handleEncryptAndStore}
									className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
									disabled={hasBlob || !userMessage.trim()}
								>
									{hasBlob
										? "Message Already Stored"
										: "Encrypt & Store Message"}
								</button>

								{hasBlob && (
									<button
										type="button"
										onClick={handleRetrieveAndDecrypt}
										className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
									>
										Retrieve & Decrypt Message
									</button>
								)}
							</div>

							{/* Encrypted Message Display */}
							{encryptedMessage && (
								<div className="p-3 bg-purple-50 border border-purple-200 rounded-md">
									<p className="font-semibold text-purple-900 text-sm mb-1">
										Encrypted Message (Base64):
									</p>
									<p className="text-purple-700 font-mono text-xs break-all">
										{encryptedMessage.substring(0, 150)}...
									</p>
									<p className="text-purple-600 text-xs mt-1">
										Length: {encryptedMessage.length} characters
									</p>
								</div>
							)}

							{/* Decrypted Message Display */}
							{decryptedMessage && (
								<div className="p-3 bg-green-50 border border-green-200 rounded-md">
									<p className="font-semibold text-green-900 text-sm mb-1">
										Decrypted Message:
									</p>
									<p className="text-green-700 text-sm break-words whitespace-pre-wrap">
										{decryptedMessage}
									</p>
								</div>
							)}
						</div>
					)}

					<button
						type="button"
						onClick={handleLogout}
						className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
					>
						Logout
					</button>
				</div>
			)}

			{message && (
				<div className="mt-4 p-4 bg-gray-100 rounded-md max-w-md text-center">
					<p className="text-sm">{message}</p>
				</div>
			)}
		</div>
	);
}

export default App;
