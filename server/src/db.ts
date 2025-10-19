import type { User, Passkey } from "shared";
import type { D1Database } from "@cloudflare/workers-types";

export async function savePasskey(db: D1Database, passkey: Passkey) {
	const transportsString = passkey.transports
		? passkey.transports.join(",")
		: null;

	await db
		.prepare(
			`
      INSERT INTO passkeys (
        cred_id,
        cred_public_key,
        internal_user_id,
        webAuthn_user_id,
        counter,
        backup_eligible,
        backup_status,
        transports
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
		)
		.bind(
			passkey.id,
			passkey.publicKey,
			passkey.user.id,
			passkey.webAuthnUserID,
			passkey.counter,
			passkey.deviceType === "multiDevice" ? 1 : 0,
			passkey.backedUp ? 1 : 0,
			transportsString,
		)
		.run();
}

export async function getUser(
	db: D1Database,
	username: string,
): Promise<User | null> {
	const result = await db
		.prepare("SELECT * FROM users WHERE username = ?")
		.bind(username)
		.first<User>();
	return result;
}

export async function getPasskey(
	db: D1Database,
	user: User,
): Promise<Passkey | undefined> {
	const result = await db
		.prepare("SELECT * FROM passkeys WHERE internal_user_id = ?")
		.bind(user.id)
		.first<any>();

	if (!result) {
		return undefined;
	}

	return {
		id: result.cred_id,
		publicKey: new Uint8Array(result.cred_public_key),
		user: user,
		webAuthnUserID: result.webauthn_user_id,
		counter: result.counter,
		deviceType: result.backup_eligible ? "multiDevice" : "singleDevice",
		backedUp: Boolean(result.backup_status),
		transports: result.transports ? result.transports.split(",") : undefined,
	} as Passkey;
}

export async function createUser(
	db: D1Database,
	username: string,
): Promise<User> {
	const result = await db
		.prepare("INSERT INTO users (username) VALUES (?) RETURNING *")
		.bind(username)
		.first<User>();

	if (!result) {
		throw new Error("Failed to create user");
	}

	return result;
}

export async function getUserPasskeys(
	db: D1Database,
	userId: number,
): Promise<Passkey[]> {
	const results = await db
		.prepare("SELECT * FROM passkeys WHERE internal_user_id = ?")
		.bind(userId)
		.all<any>();

	const user = await db
		.prepare("SELECT * FROM users WHERE id = ?")
		.bind(userId)
		.first<User>();

	if (!user) {
		return [];
	}

	return results.results.map((result) => ({
		id: result.cred_id,
		publicKey: new Uint8Array(result.cred_public_key),
		user: user,
		webAuthnUserID: result.webauthn_user_id,
		counter: result.counter,
		deviceType: result.backup_eligible ? "multiDevice" : "singleDevice",
		backedUp: Boolean(result.backup_status),
		transports: result.transports ? result.transports.split(",") : undefined,
	}));
}

export async function getPasskeyById(
	db: D1Database,
	credId: string,
): Promise<Passkey | undefined> {
	const result = await db
		.prepare("SELECT * FROM passkeys WHERE cred_id = ?")
		.bind(credId)
		.first<any>();

	if (!result) {
		return undefined;
	}

	const user = await db
		.prepare("SELECT * FROM users WHERE id = ?")
		.bind(result.internal_user_id)
		.first<User>();

	if (!user) {
		return undefined;
	}

	return {
		id: result.cred_id,
		publicKey: new Uint8Array(result.cred_public_key),
		user: user,
		webAuthnUserID: result.webauthn_user_id,
		counter: result.counter,
		deviceType: result.backup_eligible ? "multiDevice" : "singleDevice",
		backedUp: Boolean(result.backup_status),
		transports: result.transports ? result.transports.split(",") : undefined,
	} as Passkey;
}

export async function updatePasskeyCounter(
	db: D1Database,
	credId: string,
	newCounter: number,
) {
	await db
		.prepare(
			"UPDATE passkeys SET counter = ?, last_used = CURRENT_TIMESTAMP WHERE cred_id = ?",
		)
		.bind(newCounter, credId)
		.run();
}
