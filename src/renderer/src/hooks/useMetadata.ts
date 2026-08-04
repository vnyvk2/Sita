import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { metadataQuery } from '../queries/metadata';

export function useMergedMetadata(entityKind: string, entityId: string | number) {
  return useQuery(metadataQuery.merged({ entityKind, entityId }));
}

export function useSetMetadataField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      entityKind: string;
      entityId: string | number;
      fieldId: string;
      value: unknown;
    }) => {
      return window.api.metadata.setField(
        { entityKind: payload.entityKind, entityId: payload.entityId },
        payload.fieldId,
        payload.value
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: metadataQuery.merged({
          entityKind: variables.entityKind,
          entityId: variables.entityId
        }).queryKey
      });
    }
  });
}

export function useSetMetadataFields() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      entityKind: string;
      entityId: string | number;
      overrides: Record<string, unknown>;
    }) => {
      return window.api.metadata.setFields(
        { entityKind: payload.entityKind, entityId: payload.entityId },
        payload.overrides
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: metadataQuery.merged({
          entityKind: variables.entityKind,
          entityId: variables.entityId
        }).queryKey
      });
    }
  });
}

export function useRemoveMetadataField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      entityKind: string;
      entityId: string | number;
      fieldId: string;
    }) => {
      return window.api.metadata.removeField(
        { entityKind: payload.entityKind, entityId: payload.entityId },
        payload.fieldId
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: metadataQuery.merged({
          entityKind: variables.entityKind,
          entityId: variables.entityId
        }).queryKey
      });
    }
  });
}

export function useClearMetadataOverrides() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      entityKind: string;
      entityId: string | number;
    }) => {
      return window.api.metadata.clearOverrides({
        entityKind: payload.entityKind,
        entityId: payload.entityId
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: metadataQuery.merged({
          entityKind: variables.entityKind,
          entityId: variables.entityId
        }).queryKey
      });
    }
  });
}
