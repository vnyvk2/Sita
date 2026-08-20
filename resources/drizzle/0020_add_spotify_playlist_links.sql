CREATE TABLE "spotify_playlist_links" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "spotify_playlist_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"spotify_user_id" varchar(255) NOT NULL,
	"playlist_id" integer NOT NULL,
	"spotify_playlist_id" varchar(255) NOT NULL,
	"spotify_playlist_name" varchar(255),
	"last_synced_snapshot_id" text,
	"last_synced_entries_hash" text,
	"sync_strategy" varchar(50) DEFAULT 'UNION_MERGE' NOT NULL,
	"sync_state" varchar(50) DEFAULT 'SYNCED' NOT NULL,
	"failure_stage" varchar(50),
	"completed_remote_batches" integer DEFAULT 0,
	"failed_batch_index" integer,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spotify_playlist_links_playlist_id_unique" UNIQUE("playlist_id")
);
--> statement-breakpoint
ALTER TABLE "spotify_playlist_links" ADD CONSTRAINT "spotify_playlist_links_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX "idx_spotify_playlist_links_user_id" ON "spotify_playlist_links" USING btree ("spotify_user_id");
--> statement-breakpoint
CREATE INDEX "idx_spotify_playlist_links_spotify_playlist_id" ON "spotify_playlist_links" USING btree ("spotify_playlist_id");
