ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "is_favorite" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_albums_is_favorite" ON "albums" USING btree ("is_favorite");
