-- Migration: Add blob reference columns to users table
-- Run this migration on existing databases

ALTER TABLE users ADD COLUMN encrypted_blob_key TEXT;
ALTER TABLE users ADD COLUMN blob_nonce TEXT;
