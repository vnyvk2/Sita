import { ipcMain } from 'electron';

import type { MetadataFieldId } from '../models/MetadataFieldId';
import { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataKind } from '../models/MetadataKind';
import type { MetadataOverrideValue } from '../repository/models/MetadataOverride';
import { MetadataBootstrap } from '../setup';

export interface IdentityPayload {
  entityKind: MetadataKind;
  entityId: string | number;
}

export function registerMetadataIPCHandlers(): void {
  ipcMain.handle(
    'metadata:getMerged',
    async (_event, payload: IdentityPayload) => {
      const container = await MetadataBootstrap.getInstance();
      const identity = new MetadataIdentity({
        entityKind: payload.entityKind,
        entityId: payload.entityId
      });
      const entity = await container.engine.load(identity);
      if (!entity) return null;

      const fieldsRecord: Record<string, { value: unknown; source?: string; confidence?: number }> = {};
      for (const [fieldId, val] of Object.entries(entity.getAllFields())) {
        fieldsRecord[fieldId] = {
          value: val.value,
          source: val.source,
          confidence: val.confidence
        };
      }

      return {
        identity: {
          entityKind: entity.kind,
          entityId: entity.identity.entityId
        },
        fields: fieldsRecord
      };
    }
  );

  ipcMain.handle(
    'metadata:setField',
    async (
      _event,
      payload: {
        identity: IdentityPayload;
        fieldId: MetadataFieldId;
        value: MetadataOverrideValue;
      }
    ) => {
      const container = await MetadataBootstrap.getInstance();
      const identity = new MetadataIdentity({
        entityKind: payload.identity.entityKind,
        entityId: payload.identity.entityId
      });
      await container.userService.setField(identity, payload.fieldId, payload.value);
      return { success: true };
    }
  );

  ipcMain.handle(
    'metadata:setFields',
    async (
      _event,
      payload: {
        identity: IdentityPayload;
        overrides: Record<MetadataFieldId, MetadataOverrideValue>;
      }
    ) => {
      const container = await MetadataBootstrap.getInstance();
      const identity = new MetadataIdentity({
        entityKind: payload.identity.entityKind,
        entityId: payload.identity.entityId
      });
      await container.userService.setOverrides(identity, payload.overrides);
      return { success: true };
    }
  );

  ipcMain.handle(
    'metadata:removeField',
    async (
      _event,
      payload: {
        identity: IdentityPayload;
        fieldId: MetadataFieldId;
      }
    ) => {
      const container = await MetadataBootstrap.getInstance();
      const identity = new MetadataIdentity({
        entityKind: payload.identity.entityKind,
        entityId: payload.identity.entityId
      });
      await container.userService.removeOverride(identity, payload.fieldId);
      return { success: true };
    }
  );

  ipcMain.handle(
    'metadata:clearOverrides',
    async (_event, payload: { identity: IdentityPayload }) => {
      const container = await MetadataBootstrap.getInstance();
      const identity = new MetadataIdentity({
        entityKind: payload.identity.entityKind,
        entityId: payload.identity.entityId
      });
      await container.userService.clearOverrides(identity);
      return { success: true };
    }
  );
}
