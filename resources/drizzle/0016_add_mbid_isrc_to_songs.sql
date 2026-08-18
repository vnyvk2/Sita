ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "music_brainz_recording_id" text;
--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "isrc" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_songs_music_brainz_recording_id" ON "songs" ("music_brainz_recording_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_songs_isrc" ON "songs" ("isrc");
