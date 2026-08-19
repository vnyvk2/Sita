ALTER TABLE "user_settings"
ADD COLUMN IF NOT EXISTS "metadata_preferences" jsonb DEFAULT '{"enabledSearchProviders":["musicbrainz"],"searchProviderPriority":["musicbrainz"],"defaultEnrichmentProviders":{"artwork":"coverartarchive","genres":"discogs","lyrics":"lrclib"}}'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "user_settings"
SET "metadata_preferences" = '{"enabledSearchProviders":["musicbrainz"],"searchProviderPriority":["musicbrainz"],"defaultEnrichmentProviders":{"artwork":"coverartarchive","genres":"discogs","lyrics":"lrclib"}}'::jsonb
WHERE "metadata_preferences" IS NULL;
