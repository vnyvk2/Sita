ALTER TABLE "artworks" ADD COLUMN "hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "artworks" ADD CONSTRAINT "artworks_hash_unique" UNIQUE("hash");