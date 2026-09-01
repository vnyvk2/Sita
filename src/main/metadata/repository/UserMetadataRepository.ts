import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db/db';
import { metadataOverrides } from '../../db/schema';
import type { MetadataFieldId } from '../models/MetadataFieldId';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataOverride, MetadataOverrideValue } from './models/MetadataOverride';
import { MetadataOverrideSerializer } from './models/MetadataOverrideSerializer';

export class UserMetadataRepository {
  private readonly database: typeof db;

  constructor(database: typeof db = db) {
    this.database = database;
  }

  public async getOverrides(identity: MetadataIdentity): Promise<MetadataOverride[]> {
    const kind = identity.entityKind;
    const id = String(identity.entityId);

    const rows = await this.database
      .select()
      .from(metadataOverrides)
      .where(and(eq(metadataOverrides.entityKind, kind), eq(metadataOverrides.entityId, id)));

    return rows.map((row) => MetadataOverrideSerializer.deserializeRow(row));
  }

  public async getOverridesForMany(
    identities: MetadataIdentity[]
  ): Promise<Map<string, MetadataOverride[]>> {
    const resultMap = new Map<string, MetadataOverride[]>();
    if (identities.length === 0) return resultMap;

    const kindMap = new Map<string, string[]>();
    for (const identity of identities) {
      const k = identity.entityKind;
      const id = String(identity.entityId);
      if (!kindMap.has(k)) {
        kindMap.set(k, []);
      }
      kindMap.get(k)!.push(id);
    }

    for (const [kind, ids] of kindMap.entries()) {
      const rows = await this.database
        .select()
        .from(metadataOverrides)
        .where(
          and(eq(metadataOverrides.entityKind, kind), inArray(metadataOverrides.entityId, ids))
        );

      for (const row of rows) {
        const key = `${row.entityKind}:${row.entityId}`;
        if (!resultMap.has(key)) {
          resultMap.set(key, []);
        }
        resultMap.get(key)!.push(MetadataOverrideSerializer.deserializeRow(row));
      }
    }

    return resultMap;
  }

  public async setOverrides(
    identity: MetadataIdentity,
    overrides: Record<MetadataFieldId, MetadataOverrideValue>
  ): Promise<void> {
    const kind = identity.entityKind;
    const id = String(identity.entityId);

    await this.database.transaction(async (tx) => {
      for (const [fieldId, val] of Object.entries(overrides)) {
        if (val === undefined || val === null) {
          await tx
            .delete(metadataOverrides)
            .where(
              and(
                eq(metadataOverrides.entityKind, kind),
                eq(metadataOverrides.entityId, id),
                eq(metadataOverrides.fieldId, fieldId)
              )
            );
          continue;
        }

        const serialized = MetadataOverrideSerializer.serializeValue(val);

        await tx
          .insert(metadataOverrides)
          .values({
            entityKind: kind,
            entityId: id,
            fieldId,
            ...serialized,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .onConflictDoUpdate({
            target: [
              metadataOverrides.entityKind,
              metadataOverrides.entityId,
              metadataOverrides.fieldId
            ],
            set: {
              ...serialized,
              updatedAt: new Date()
            }
          });
      }
    });
  }

  public async removeOverride(identity: MetadataIdentity, fieldId: MetadataFieldId): Promise<void> {
    const kind = identity.entityKind;
    const id = String(identity.entityId);

    await this.database
      .delete(metadataOverrides)
      .where(
        and(
          eq(metadataOverrides.entityKind, kind),
          eq(metadataOverrides.entityId, id),
          eq(metadataOverrides.fieldId, fieldId)
        )
      );
  }

  public async clearOverrides(identity: MetadataIdentity): Promise<void> {
    const kind = identity.entityKind;
    const id = String(identity.entityId);

    console.log(
      '[STAGE 2: Repository clearOverrides] Executing DELETE FROM metadata_overrides for:',
      {
        entityKind: kind,
        entityId: id
      }
    );

    await this.database
      .delete(metadataOverrides)
      .where(and(eq(metadataOverrides.entityKind, kind), eq(metadataOverrides.entityId, id)));

    console.log('[STAGE 2: Repository clearOverrides] Successfully deleted overrides for:', {
      entityKind: kind,
      entityId: id
    });
  }
}
