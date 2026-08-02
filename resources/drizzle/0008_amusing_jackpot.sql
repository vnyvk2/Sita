CREATE TABLE "collection_contexts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "collection_contexts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"collection_uri" varchar(255) NOT NULL,
	"context_data" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "collection_contexts_collection_uri_unique" UNIQUE("collection_uri")
);
--> statement-breakpoint
CREATE TABLE "operation_journal" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "operation_journal_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"collection_type" varchar(20) NOT NULL,
	"collection_id" integer NOT NULL,
	"operation_type" varchar(50) NOT NULL,
	"direction" varchar(10) DEFAULT 'forward' NOT NULL,
	"operation_input" json NOT NULL,
	"reverse_data" json NOT NULL,
	"sequence_number" integer NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "playlist_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"playlist_id" integer NOT NULL,
	"song_id" integer NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"source" varchar(50) DEFAULT 'manual',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_playlist_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "smart_playlist_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"playlist_id" integer NOT NULL,
	"rule_ast" json NOT NULL,
	"rule_version" integer DEFAULT 1 NOT NULL,
	"max_entries" integer,
	"sort_definition" json,
	"last_generated_at" timestamp,
	"rule_hash" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "smart_playlist_rules_playlist_id_unique" UNIQUE("playlist_id")
);
--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "playlist_type" varchar(20) DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "item_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "total_duration" numeric(12, 3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "sidebar_position" integer;--> statement-breakpoint
ALTER TABLE "playlist_entries" ADD CONSTRAINT "playlist_entries_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "playlist_entries" ADD CONSTRAINT "playlist_entries_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "smart_playlist_rules" ADD CONSTRAINT "smart_playlist_rules_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "idx_collection_contexts_uri" ON "collection_contexts" USING btree ("collection_uri");--> statement-breakpoint
CREATE INDEX "idx_journal_collection" ON "operation_journal" USING btree ("collection_type","collection_id");--> statement-breakpoint
CREATE INDEX "idx_journal_sequence" ON "operation_journal" USING btree ("sequence_number" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_journal_expires" ON "operation_journal" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_playlist_entries_playlist_id" ON "playlist_entries" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "idx_playlist_entries_song_id" ON "playlist_entries" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "idx_playlist_entries_playlist_position" ON "playlist_entries" USING btree ("playlist_id","position");--> statement-breakpoint
CREATE INDEX "idx_playlist_entries_added_at" ON "playlist_entries" USING btree ("added_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_smart_playlist_rules_playlist_id" ON "smart_playlist_rules" USING btree ("playlist_id");--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_parent_id_playlists_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."playlists"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "idx_playlists_parent_id" ON "playlists" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_playlists_type" ON "playlists" USING btree ("playlist_type");--> statement-breakpoint
CREATE INDEX "idx_playlists_sidebar" ON "playlists" USING btree ("sidebar_position");