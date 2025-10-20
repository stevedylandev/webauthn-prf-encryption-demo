-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username VARCHAR NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  prf_salt TEXT,
  encrypted_blob_key TEXT,
  blob_nonce TEXT
)

-- Create passkeys table
CREATE TABLE IF NOT EXISTS passkeys (
  cred_id TEXT PRIMARY KEY,
  cred_public_key BLOB NOT NULL,
  internal_user_id INTEGER NOT NULL,
  webAuthn_user_id TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  backup_eligible BOOLEAN NOT NULL DEFAULT 0,
  backup_status BOOLEAN NOT NULL DEFAULT 0,
  transports TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (internal_user_id) REFERENCES users(id)
);
