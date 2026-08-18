-- Step 1: Deduplicate existing palettes deterministically keeping the highest version and latest row per artwork
DELETE FROM "palettes"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("artwork_id") "id"
  FROM "palettes"
  ORDER BY "artwork_id", "generator_version" DESC, "updated_at" DESC, "id" DESC
);
--> statement-breakpoint
-- Step 2: Drop the existing non-unique index
DROP INDEX IF EXISTS "idx_palettes_artwork_id";
--> statement-breakpoint
-- Step 3: Create the unique index on artwork_id
CREATE UNIQUE INDEX IF NOT EXISTS "idx_palettes_artwork_id" ON "palettes" USING btree ("artwork_id");
