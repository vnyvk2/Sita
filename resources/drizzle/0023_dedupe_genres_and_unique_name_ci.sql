-- Deduplicate case-insensitive genre names, then enforce uniqueness on genres.name_ci.
--
-- Context: song parsing used a read-then-insert pattern with no DB constraint, so
-- duplicate genres differing only by case ("Rock" / "rock") could accumulate. The
-- unique index backing createGenre's ON CONFLICT (name_ci) clause cannot be created
-- while duplicates exist (and ON CONFLICT targeting a column without a matching
-- unique index fails statement planning outright). Merge duplicates FIRST, then
-- install the unique index.
--
-- Merge policy: keep the lowest id per name_ci. Junction rows (genres_songs,
-- artworks_genres) are repointed to the survivor; links the survivor already has
-- are skipped via ON CONFLICT DO NOTHING instead of colliding with the composite
-- primary keys. Duplicate genre rows are deleted last.

INSERT INTO "genres_songs" ("genre_id", "song_id")
SELECT m."keep_id", gs."song_id"
FROM "genres_songs" gs
JOIN (
  SELECT g."id" AS "dup_id", MIN(g."id") OVER (PARTITION BY g."name_ci") AS "keep_id"
  FROM "genres" g
) m ON gs."genre_id" = m."dup_id" AND m."dup_id" <> m."keep_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "artworks_genres" ("genre_id", "artwork_id")
SELECT m."keep_id", ag."artwork_id"
FROM "artworks_genres" ag
JOIN (
  SELECT g."id" AS "dup_id", MIN(g."id") OVER (PARTITION BY g."name_ci") AS "keep_id"
  FROM "genres" g
) m ON ag."genre_id" = m."dup_id" AND m."dup_id" <> m."keep_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM "genres_songs" gs
USING "genres" g
WHERE gs."genre_id" = g."id"
  AND EXISTS (
    SELECT 1 FROM "genres" keeper
    WHERE keeper."name_ci" = g."name_ci" AND keeper."id" < g."id"
  );
--> statement-breakpoint
DELETE FROM "artworks_genres" ag
USING "genres" g
WHERE ag."genre_id" = g."id"
  AND EXISTS (
    SELECT 1 FROM "genres" keeper
    WHERE keeper."name_ci" = g."name_ci" AND keeper."id" < g."id"
  );
--> statement-breakpoint
DELETE FROM "genres" g
USING "genres" keeper
WHERE g."name_ci" = keeper."name_ci" AND g."id" > keeper."id";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_genres_name_ci";
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_genres_name_ci" ON "genres" USING btree ("name_ci");
