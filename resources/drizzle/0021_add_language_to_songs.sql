ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "language" varchar(64);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_songs_language" ON "songs" ("language");
