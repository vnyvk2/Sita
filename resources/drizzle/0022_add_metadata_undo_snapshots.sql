CREATE TABLE IF NOT EXISTS "metadata_undo_snapshots" (
	"id" text PRIMARY KEY,
	"seq" integer GENERATED ALWAYS AS IDENTITY,
	"description" text DEFAULT '' NOT NULL,
	"album_title" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metadata_undo_snapshots_seq_idx" ON "metadata_undo_snapshots" ("seq");
