import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	type PublicKeyCredentialCreationOptionsJSON,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Passkey } from "shared/dist";
import {
	createUser,
	getPasskeyById,
	getUser,
	getUserPasskeys,
	savePasskey,
	updatePasskeyCounter,
} from "./db";

type Bindings = {
	DB: D1Database;
	R2_BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// In-memory challenge storage (in production, use KV or Durable Objects)
const challenges = new Map<string, string>();

app.use(cors());

app.get("/", (c) => {
	return c.text("Hello Hono!");
});

app.post("/generate-registration-options", async (c) => {
	const { username } = await c.req.json();

	const rpName = "SimpleWebAuthn Example";
	const rpID = "localhost";
	const origin = `http://${rpID}:5173`;

	// Check if user exists, if not create them
	let user = await getUser(c.env.DB, username);
	if (!user) {
		user = await createUser(c.env.DB, username);
	}

	// Get existing passkeys for this user
	const userPasskeys = await getUserPasskeys(c.env.DB, user.id);

	const options: PublicKeyCredentialCreationOptionsJSON =
		await generateRegistrationOptions({
			rpName,
			rpID,
			userName: user.username,
			userID: new Uint8Array(Buffer.from(user.id.toString())),
			// Don't prompt users for additional information about the authenticator
			// (Recommended for smoother UX)
			attestationType: "none",
			// Prevent users from re-registering existing authenticators
			excludeCredentials: userPasskeys.map((passkey) => ({
				id: passkey.id,
				transports: passkey.transports,
			})),
			authenticatorSelection: {
				residentKey: "preferred",
				userVerification: "preferred",
				authenticatorAttachment: "platform",
			},
		});

	// Store the challenge for this user
	challenges.set(username, options.challenge);

	return c.json(options);
});

app.post("/verify-registration", async (c) => {
	const { username, response } = await c.req.json();

	const rpID = "localhost";
	const origin = `http://${rpID}:5173`;

	// Get the expected challenge
	const expectedChallenge = challenges.get(username);
	if (!expectedChallenge) {
		return c.json({ error: "Challenge not found" }, 400);
	}

	const user = await getUser(c.env.DB, username);
	if (!user) {
		return c.json({ error: "User not found" }, 400);
	}

	try {
		const verification = await verifyRegistrationResponse({
			response,
			expectedChallenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
		});

		const { verified, registrationInfo } = verification;

		if (verified && registrationInfo) {
			const { credential, credentialDeviceType, credentialBackedUp } =
				registrationInfo;

			const newPasskey: Passkey = {
				user,
				webAuthnUserID: response.response.userHandle || user.id.toString(),
				id: credential.id,
				publicKey: credential.publicKey,
				counter: credential.counter,
				transports: response.response.transports,
				deviceType: credentialDeviceType,
				backedUp: credentialBackedUp,
			};

			// Save the passkey to the database
			await savePasskey(c.env.DB, newPasskey);

			// Remove the challenge
			challenges.delete(username);

			return c.json({ verified: true });
		}

		return c.json({ verified: false });
	} catch (error) {
		console.error(error);
		return c.json({ error: String(error) }, 400);
	}
});

app.post("/generate-authentication-options", async (c) => {
	const { username } = await c.req.json();

	const rpID = "localhost";

	const user = await getUser(c.env.DB, username);
	if (!user) {
		return c.json({ error: "User not found" }, 404);
	}

	// Get user's passkeys
	const userPasskeys = await getUserPasskeys(c.env.DB, user.id);

	if (userPasskeys.length === 0) {
		return c.json({ error: "No passkeys found for user" }, 404);
	}

	const options = await generateAuthenticationOptions({
		rpID,
		allowCredentials: userPasskeys.map((passkey) => ({
			id: passkey.id,
			transports: passkey.transports,
		})),
		userVerification: "preferred",
	});

	// Store the challenge for this user
	challenges.set(username, options.challenge);

	return c.json(options);
});

app.post("/verify-authentication", async (c) => {
	const { username, response } = await c.req.json();

	const rpID = "localhost";
	const origin = `http://${rpID}:5173`;

	// Get the expected challenge
	const expectedChallenge = challenges.get(username);
	if (!expectedChallenge) {
		return c.json({ error: "Challenge not found" }, 400);
	}

	const user = await getUser(c.env.DB, username);
	if (!user) {
		return c.json({ error: "User not found" }, 404);
	}

	// Get the passkey from the database
	const passkey = await getPasskeyById(c.env.DB, response.id);
	if (!passkey) {
		return c.json({ error: "Passkey not found" }, 404);
	}

	try {
		const verification = await verifyAuthenticationResponse({
			response,
			expectedChallenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			credential: {
				id: passkey.id,
				publicKey: new Uint8Array(passkey.publicKey),
				counter: passkey.counter,
				transports: passkey.transports,
			},
		});

		const { verified, authenticationInfo } = verification;

		if (verified) {
			// Update the counter
			await updatePasskeyCounter(
				c.env.DB,
				passkey.id,
				authenticationInfo.newCounter,
			);

			// Remove the challenge
			challenges.delete(username);

			return c.json({ verified: true, user: passkey.user });
		}

		return c.json({ verified: false });
	} catch (error) {
		console.error(error);
		return c.json({ error: String(error) }, 400);
	}
});

export default app;
