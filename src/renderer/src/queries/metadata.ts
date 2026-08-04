import { createQueryKeys } from '@lukemorales/query-key-factory';

export interface MergedMetadataResponse {
  identity: {
    entityKind: string;
    entityId: string | number;
  };
  fields: Record<string, { value: unknown; source?: string; confidence?: number }>;
}

export const metadataQuery = createQueryKeys('metadata', {
  merged: (data: { entityKind: string; entityId: string | number }) => {
    const { entityKind, entityId } = data;
    return {
      queryKey: [`kind=${entityKind}`, `id=${entityId}`],
      queryFn: async (): Promise<MergedMetadataResponse | null> => {
        try {
          const result = await window.api.metadata.getMerged({ entityKind, entityId });
          return result ?? null;
        } catch (error) {
          console.error('[metadataQuery] Error fetching merged metadata:', error);
          return null;
        }
      }
    };
  }
});
