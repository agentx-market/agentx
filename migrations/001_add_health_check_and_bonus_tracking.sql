-- Migration: Add health check and welcome bonus tracking to operators and agents tables
-- Feature #25: Abuse prevention for Lightning rewards

-- Add welcome bonus tracking to operators (if not exists)
-- Column already exists from db.js schema, skip if present
-- ALTER TABLE operators ADD COLUMN welcome_bonus_claimed_at INTEGER;

-- Add health check tracking to agents (columns already exist from db.js)
-- This migration is idempotent