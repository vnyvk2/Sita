ALTER TABLE "playlists" ADD COLUMN "pinned_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_playlists_pinned" ON "playlists" USING btree ("pinned_at" DESC NULLS LAST);