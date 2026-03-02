-- Add slug column to agents table for URL-friendly agent lookups
ALTER TABLE agents ADD COLUMN slug TEXT;

-- Populate slugs from agent names (lowercase, spaces to hyphens)
UPDATE agents SET slug = lower(replace(replace(replace(name, ' ', '-'), '_', '-'), '.', '')) WHERE slug IS NULL;

-- Make slug unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_slug ON agents(slug);
