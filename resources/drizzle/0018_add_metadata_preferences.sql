ALTER TABLE "user_settings"
ADD COLUMN IF NOT EXISTS "metadata_preferences" jsonb;
