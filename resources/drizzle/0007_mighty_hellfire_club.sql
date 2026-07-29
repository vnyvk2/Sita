CREATE TYPE "public"."lyrics_provider" AS ENUM('MUSIXMATCH', 'LRCLIB', 'EMBEDDED', 'FILESYSTEM');--> statement-breakpoint
CREATE TABLE "lyrics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lyrics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"song_id" integer NOT NULL,
	"text" text NOT NULL,
	"is_synced" boolean DEFAULT false NOT NULL,
	"provider" "lyrics_provider" NOT NULL,
	"generator_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lyrics_song_id_unique" UNIQUE("song_id")
);
--> statement-breakpoint
CREATE TABLE "replay_gain" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "replay_gain_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"song_id" integer NOT NULL,
	"track_gain" double precision,
	"track_peak" double precision,
	"album_gain" double precision,
	"album_peak" double precision,
	"generator_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "replay_gain_song_id_unique" UNIQUE("song_id")
);
--> statement-breakpoint
CREATE TABLE "waveforms" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "waveforms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"song_id" integer NOT NULL,
	"path" text NOT NULL,
	"resolution" integer NOT NULL,
	"generator_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waveforms_song_id_unique" UNIQUE("song_id")
);
--> statement-breakpoint
ALTER TABLE "artworks" ADD COLUMN "generator_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "palettes" ADD COLUMN "generator_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lyrics" ADD CONSTRAINT "lyrics_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "replay_gain" ADD CONSTRAINT "replay_gain_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "waveforms" ADD CONSTRAINT "waveforms_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "idx_lyrics_song_id" ON "lyrics" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "idx_replay_gain_song_id" ON "replay_gain" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "idx_waveforms_song_id" ON "waveforms" USING btree ("song_id");