CREATE TABLE IF NOT EXISTS "metadata_pending_writes" (
	"id" text PRIMARY KEY,
	"song_path" text NOT NULL UNIQUE,
	"tags" jsonb NOT NULL,
	"is_known_source" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metadata_pending_writes_song_path_idx" ON "metadata_pending_writes" ("song_path");
