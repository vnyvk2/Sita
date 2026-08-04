import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db/db';
import { metadataOverrides } from '../../db/schema';
import type { MetadataFieldId } from '../models/MetadataFieldId';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataOverride, MetadataOverrideValue } from './models/MetadataOverride';

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
      .where(
        and(
          eq(metadataOverrides.entityKind, kind),
          eq(metadataOverrides.entityId, id)
        )
      );

    return rows.map((row) => this.mapRowToOverride(row));
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
          and(
            eq(metadataOverrides.entityKind, kind),
            inArray(metadataOverrides.entityId, ids)
          )
        );

      for (const row of rows) {
        const key = `${row.entityKind}:${row.entityId}`;
        if (!resultMap.has(key)) {
          resultMap.set(key, []);
        }
        resultMap.get(key)!.push(this.mapRowToOverride(row));
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

        let stringValue: string | null = null;
        let numberValue: number | null = null;
        let booleanValue: boolean | null = null;
        let jsonValue: string | null = null;

        if (typeof val === 'string') {
          stringValue = val;
        } else if (typeof val === 'number') {
          numberValue = val;
        } else if (typeof val === 'boolean') {
          booleanValue = val;
        } else if (typeof val === 'object') {
          jsonValue = JSON.stringify(val);
        }

        const existing = await tx
          .select({ id: metadataOverrides.id })
          .from(metadataOverrides)
          .where(
            and(
              eq(metadataOverrides.entityKind, kind),
              eq(metadataOverrides.entityId, id),
              eq(metadataOverrides.fieldId, fieldId)
            )
          );

        if (existing.length > 0) {
          await tx
            .update(metadataOverrides)
            .set({
              stringValue,
              numberValue,
              booleanValue,
              jsonValue,
              updatedAt: new Date()
            })
            .where(eq(metadataOverrides.id, existing[0].id));
        } else {
          await tx.insert(metadataOverrides).values({
            entityKind: kind,
            entityId: id,
            fieldId,
            stringValue,
            numberValue,
            booleanValue,
            jsonValue,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    });
  }

  public async removeOverride(
    identity: MetadataIdentity,
    fieldId: MetadataFieldId
  ): Promise<void> {
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

    await this.database
      .delete(metadataOverrides)
      .where(
        and(
          eq(metadataOverrides.entityKind, kind),
          eq(metadataOverrides.entityId, id)
        )
      );
  }

  private mapRowToOverride(row: typeof metadataOverrides.$inferSelect): MetadataOverride {
    let value: MetadataOverrideValue = null as any;

    if (row.stringValue !== null && row.stringValue !== undefined) {
      value = row.stringValue;
    } else if (row.numberValue !== null && row.numberValue !== undefined) {
      value = row.numberValue;
    } else if (row.booleanValue !== null && row.booleanValue !== undefined) {
      value = row.booleanValue;
    } else if (row.jsonValue !== null && row.jsonValue !== undefined) {
      try {
        value = JSON.parse(row.jsonValue);
      } catch {
        value = row.jsonValue;
      }
    }

    return {
      id: row.id,
      entityKind: row.entityKind,
      entityId: row.entityId,
      fieldId: row.fieldId as MetadataFieldId,
      value,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
