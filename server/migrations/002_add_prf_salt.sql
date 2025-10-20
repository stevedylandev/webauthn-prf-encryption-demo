-- Migration: Add PRF salt column to users table
-- Run this migration on existing databases

ALTER TABLE users ADD COLUMN prf_salt TEXT;
