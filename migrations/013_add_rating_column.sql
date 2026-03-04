-- Migration: Add rating column to agents table
-- Feature #60: Alternatives pages with rating-based sorting

-- Add rating column to agents table
ALTER TABLE agents ADD COLUMN rating REAL;

-- Add index for faster rating-based queries
CREATE INDEX IF NOT EXISTS idx_agents_rating ON agents(rating);