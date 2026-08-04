import { ipcMain } from 'electron';

import type { MetadataEngine } from '../engine/MetadataEngine';
import type { MetadataFieldId } from '../models/MetadataFieldId';
import { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataKind } from '../models/MetadataKind';
import type { MetadataOverrideValue } from '../repository/models/MetadataOverride';
import { MetadataSnapshotSerializer, type MetadataEntityDTO } from '../serializers/MetadataSnapshotSerializer';
import type { UserMetadataService } from '../services/UserMetadataService';

export interface IdentityPayload {
  entityKind: MetadataKind;
  entityId: string | number;
}

export function registerMetadataIPCHandlers(
  engine: MetadataEngine,
  userService: UserMetadataService
): void {
  ipcMain.handle(
    'metadata.load',
    async (_event, payload: IdentityPayload): Promise<MetadataEntityDTO | null> => {
      const identity = new MetadataIdentity({
        entityKind: payload.entityKind,
        entityId: payload.entityId
      });
      const entity = await engine.load(identity);
      if (!entity) return null;

      return MetadataSnapshotSerializer.toDTO(entity);
    }
  );

  ipcMain.handle(
    'metadata.override.set',
    async (
      _event,
      payload: {
        identity: IdentityPayload;
        fieldId: MetadataFieldId;
        value: MetadataOverrideValue;
      }
    ) => {
      const identity = new MetadataIdentity({
        entityKind: payload.identity.entityKind,
        entityId: payload.identity.entityId
      });
      await userService.setField(identity, payload.fieldId, payload.value);
      return { success: true };
    }
  );

  ipcMain.handle(
    'metadata.override.setBatch',
    async (
      _event,
      payload: {
        identity: IdentityPayload;
        overrides: Record<MetadataFieldId, MetadataOverrideValue>;
      }
    ) => {
      const identity = new MetadataIdentity({
        entityKind: payload.identity.entityKind,
        entityId: payload.identity.entityId
      });
      await userService.setOverrides(identity, payload.overrides);
      return { success: true };
    }
  );

  ipcMain.handle(
    'metadata.override.remove',
    async (
      _event,
      payload: {
        identity: IdentityPayload;
        fieldId: MetadataFieldId;
      }
    ) => {
      const identity = new MetadataIdentity({
        entityKind: payload.identity.entityKind,
        entityId: payload.identity.entityId
      });
      await userService.removeOverride(identity, payload.fieldId);
      return { success: true };
    }
  );

  ipcMain.handle(
    'metadata.override.clear',
    async (_event, payload: { identity: IdentityPayload }) => {
      const identity = new MetadataIdentity({
        entityKind: payload.identity.entityKind,
        entityId: payload.identity.entityId
      });
      await userService.clearOverrides(identity);
      return { success: true };
    }
  );
}
