import beaver from "./assets/beaver.svg";
import {
	startRegistration,
	startAuthentication,
} from "@simplewebauthn/browser";
import { useState } from "react";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:8787";

function App() {
	const [username, setUsername] = useState("stevedylandev");
	const [message, setMessage] = useState("");
	const [isAuthenticated, setIsAuthenticated] = useState(false);

	async function handleRegister() {
		try {
			setMessage("Starting registration...");

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
				setMessage("Registration successful! You can now authenticate.");
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
				setMessage(`Successfully authenticated as ${username}!`);
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
		setMessage("");
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
				<div className="flex flex-col gap-4 items-center">
					<p className="text-xl font-semibold text-green-600">
						Logged in as {username}
					</p>
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
