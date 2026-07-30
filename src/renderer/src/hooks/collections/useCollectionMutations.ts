import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CollectionClient } from '../../api/CollectionClient';
import { collectionKeys } from '../../api/collectionKeys';
import type { 
  CreateFolderInput,
  CreatePlaylistInput,
  AddSongsInput,
  RenameInput, 
  MoveCollectionInput, 
  DeleteInput, 
  DuplicateInput,
  MergePlaylistsInput,
  BulkDeleteInput,
  BulkRestoreInput,
  PinInput,
  UnpinInput
} from '../../api/CollectionTypes';

export const useCreateFolder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFolderInput) => CollectionClient.createFolder(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};

export const useCreatePlaylist = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlaylistInput) => CollectionClient.createPlaylist(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};

export const useAddSongsToCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddSongsInput) => CollectionClient.addSongs(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};

export const useRenameCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RenameInput) => CollectionClient.rename(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};

export const useMoveCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MoveCollectionInput) => CollectionClient.move(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};

export const useDeleteCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeleteInput) => CollectionClient.delete(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};

export const useDuplicateCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DuplicateInput) => CollectionClient.duplicate(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};

export const useMergePlaylists = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MergePlaylistsInput) => CollectionClient.merge(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};

export const useBulkDeleteCollections = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkDeleteInput) => CollectionClient.bulkDelete(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};

export const useBulkRestoreCollections = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkRestoreInput) => CollectionClient.bulkRestore(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};

export const usePinCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PinInput) => CollectionClient.pin(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};

export const useUnpinCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UnpinInput) => CollectionClient.unpin(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};

export const useUndoCollectionAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) => CollectionClient.undo(collectionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};

export const useRedoCollectionAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) => CollectionClient.redo(collectionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all })
  });
};
