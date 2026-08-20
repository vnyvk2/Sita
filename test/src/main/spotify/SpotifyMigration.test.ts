import fs from 'node:fs';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { describe, expect, it } from 'vitest';

describe('Drizzle Migration 0020 (spotify_playlist_links Live PGlite Execution & Schema Parity)', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../../resources/drizzle/0020_add_spotify_playlist_links.sql'
  );
  const journalPath = path.resolve(
    __dirname,
    '../../../../resources/drizzle/meta/_journal.json'
  );

  it('should verify migration 0020 is registered in _journal.json', () => {
    expect(fs.existsSync(journalPath)).toBe(true);
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

    const entry20 = journal.entries.find((e: any) => e.idx === 20);
    expect(entry20).toBeDefined();
    expect(entry20.tag).toBe('0020_add_spotify_playlist_links');
  });

  it(
    'should execute 0020 migration on fresh PGlite database and verify full schema, constraints, defaults, and cascade parity',
    async () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const rawSql = fs.readFileSync(migrationPath, 'utf8');

      // 1. Initialize fresh in-memory PGlite database with standard extensions
      const pg = await PGlite.create('memory://', {
        extensions: { pg_trgm, citext }
      });

      // 2. Execute prerequisite parent tables
      await pg.exec(`
        CREATE TABLE "playlists" (
          "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
          "name" text NOT NULL
        );
      `);

      // 3. Execute the actual 0020 SQL migration statements sequentially
      const statements = rawSql
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const stmt of statements) {
        await pg.exec(stmt);
      }

      // 4. Verify runtime columns in information_schema: types, lengths, nullabilities, and defaults
      const columnsResult = await pg.query<{
        column_name: string;
        data_type: string;
        character_maximum_length: number | null;
        is_nullable: string;
        column_default: string | null;
        is_identity: string | null;
        identity_generation: string | null;
      }>(`
        SELECT
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default,
          is_identity,
          identity_generation
        FROM information_schema.columns
        WHERE table_name = 'spotify_playlist_links'
        ORDER BY ordinal_position;
      `);

      // Invariant: Exactly 16 columns (no unexpected extra or missing columns)
      expect(columnsResult.rows.length).toBe(16);

      const runtimeColumns = new Map(
        columnsResult.rows.map((r) => [r.column_name, r])
      );

      const expectedColumnDefinitions = [
        {
          name: 'id',
          dataType: 'integer',
          maxLength: null,
          isNullable: 'NO',
          isIdentity: 'YES',
          identityGeneration: 'ALWAYS'
        },
        {
          name: 'spotify_user_id',
          dataType: 'character varying',
          maxLength: 255,
          isNullable: 'NO'
        },
        {
          name: 'playlist_id',
          dataType: 'integer',
          maxLength: null,
          isNullable: 'NO'
        },
        {
          name: 'spotify_playlist_id',
          dataType: 'character varying',
          maxLength: 255,
          isNullable: 'NO'
        },
        {
          name: 'spotify_playlist_name',
          dataType: 'character varying',
          maxLength: 255,
          isNullable: 'YES'
        },
        {
          name: 'last_synced_snapshot_id',
          dataType: 'text',
          maxLength: null,
          isNullable: 'YES'
        },
        {
          name: 'last_synced_entries_hash',
          dataType: 'text',
          maxLength: null,
          isNullable: 'YES'
        },
        {
          name: 'sync_strategy',
          dataType: 'character varying',
          maxLength: 50,
          isNullable: 'NO',
          defaultSnippet: 'UNION_MERGE'
        },
        {
          name: 'sync_state',
          dataType: 'character varying',
          maxLength: 50,
          isNullable: 'NO',
          defaultSnippet: 'SYNCED'
        },
        {
          name: 'failure_stage',
          dataType: 'character varying',
          maxLength: 50,
          isNullable: 'YES'
        },
        {
          name: 'completed_remote_batches',
          dataType: 'integer',
          maxLength: null,
          isNullable: 'YES',
          defaultSnippet: '0'
        },
        {
          name: 'failed_batch_index',
          dataType: 'integer',
          maxLength: null,
          isNullable: 'YES'
        },
        {
          name: 'last_error',
          dataType: 'text',
          maxLength: null,
          isNullable: 'YES'
        },
        {
          name: 'last_synced_at',
          dataType: 'timestamp with time zone',
          maxLength: null,
          isNullable: 'YES'
        },
        {
          name: 'created_at',
          dataType: 'timestamp with time zone',
          maxLength: null,
          isNullable: 'NO',
          defaultSnippet: 'now()'
        },
        {
          name: 'updated_at',
          dataType: 'timestamp with time zone',
          maxLength: null,
          isNullable: 'NO',
          defaultSnippet: 'now()'
        }
      ];

      for (const expected of expectedColumnDefinitions) {
        const col = runtimeColumns.get(expected.name);
        expect(col, `Expected column ${expected.name} to exist in spotify_playlist_links`).toBeDefined();
        expect(col?.data_type).toBe(expected.dataType);
        expect(col?.is_nullable).toBe(expected.isNullable);
        if (expected.maxLength !== undefined) {
          expect(col?.character_maximum_length).toBe(expected.maxLength);
        }
        if (expected.isIdentity !== undefined) {
          expect(col?.is_identity).toBe(expected.isIdentity);
        }
        if (expected.identityGeneration !== undefined) {
          expect(col?.identity_generation).toBe(expected.identityGeneration);
        }
        if (expected.defaultSnippet) {
          expect(col?.column_default).toContain(expected.defaultSnippet);
        }
      }

      // 5. Verify constraints in information_schema.table_constraints & referential_constraints
      const constraintsResult = await pg.query<{
        constraint_name: string;
        constraint_type: string;
      }>(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'spotify_playlist_links';
      `);
      const constraintTypes = constraintsResult.rows.map((c) => c.constraint_type);
      expect(constraintTypes).toContain('PRIMARY KEY');
      expect(constraintTypes).toContain('UNIQUE');
      expect(constraintTypes).toContain('FOREIGN KEY');

      // Verify foreign key referential rules (ON DELETE CASCADE, ON UPDATE CASCADE)
      const refConstraints = await pg.query<{
        delete_rule: string;
        update_rule: string;
      }>(`
        SELECT delete_rule, update_rule
        FROM information_schema.referential_constraints
        WHERE constraint_name = 'spotify_playlist_links_playlist_id_playlists_id_fk';
      `);
      expect(refConstraints.rows.length).toBe(1);
      expect(refConstraints.rows[0].delete_rule).toBe('CASCADE');
      expect(refConstraints.rows[0].update_rule).toBe('CASCADE');

      // 6. Verify indexes in pg_indexes
      const indexesResult = await pg.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'spotify_playlist_links';
      `);
      const indexNames = indexesResult.rows.map((r) => r.indexname);
      expect(indexNames).toContain('idx_spotify_playlist_links_user_id');
      expect(indexNames).toContain('idx_spotify_playlist_links_spotify_playlist_id');
      expect(indexNames).toContain('spotify_playlist_links_playlist_id_unique');

      // 7. Test runtime integrity & default values insertion
      await pg.exec(`INSERT INTO "playlists" ("name") VALUES ('Favorites');`);

      // Insert row specifying only mandatory columns without defaults
      await pg.exec(`
        INSERT INTO "spotify_playlist_links" (
          "spotify_user_id", "playlist_id", "spotify_playlist_id"
        ) VALUES (
          'sp_user_123', 1, 'sp_playlist_abc'
        );
      `);

      const insertedRow = await pg.query<{
        id: number;
        playlist_id: number;
        sync_strategy: string;
        sync_state: string;
        completed_remote_batches: number;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, playlist_id, sync_strategy, sync_state, completed_remote_batches, created_at, updated_at
         FROM "spotify_playlist_links" WHERE "playlist_id" = 1;`
      );
      expect(insertedRow.rows.length).toBe(1);
      expect(insertedRow.rows[0].playlist_id).toBe(1);
      // Verify applied defaults
      expect(insertedRow.rows[0].sync_strategy).toBe('UNION_MERGE');
      expect(insertedRow.rows[0].sync_state).toBe('SYNCED');
      expect(insertedRow.rows[0].completed_remote_batches).toBe(0);
      expect(insertedRow.rows[0].created_at).toBeDefined();
      expect(insertedRow.rows[0].updated_at).toBeDefined();

      // 8. Test UNIQUE constraint on playlist_id
      await expect(
        pg.exec(`
          INSERT INTO "spotify_playlist_links" (
            "spotify_user_id", "playlist_id", "spotify_playlist_id"
          ) VALUES (
            'sp_user_999', 1, 'sp_playlist_other'
          );
        `)
      ).rejects.toThrow();

      // 9. Test FOREIGN KEY constraint to playlists.id
      await expect(
        pg.exec(`
          INSERT INTO "spotify_playlist_links" (
            "spotify_user_id", "playlist_id", "spotify_playlist_id"
          ) VALUES (
            'sp_user_123', 99999, 'sp_playlist_invalid'
          );
        `)
      ).rejects.toThrow();

      // 10. Test ON UPDATE CASCADE from playlists (if parent ID changes, child updates)
      // Note: Since playlists.id is GENERATED ALWAYS, test ON DELETE CASCADE
      await pg.exec(`DELETE FROM "playlists" WHERE "id" = 1;`);
      const remainingLinks = await pg.query(
        `SELECT * FROM "spotify_playlist_links" WHERE "playlist_id" = 1;`
      );
      expect(remainingLinks.rows.length).toBe(0);

      await pg.close();
    },
    60000
  );
});
