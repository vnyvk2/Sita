import { useMutation } from '@tanstack/react-query';
import { CollectionClient } from '../../api/CollectionClient';
import type { 
  CreateFolderInput, 
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
  return useMutation({
    mutationFn: (input: CreateFolderInput) => CollectionClient.createFolder(input),
  });
};

export const useRenameCollection = () => {
  return useMutation({
    mutationFn: (input: RenameInput) => CollectionClient.rename(input),
  });
};

export const useMoveCollection = () => {
  return useMutation({
    mutationFn: (input: MoveCollectionInput) => CollectionClient.move(input),
  });
};

export const useDeleteCollection = () => {
  return useMutation({
    mutationFn: (input: DeleteInput) => CollectionClient.delete(input),
  });
};

export const useDuplicateCollection = () => {
  return useMutation({
    mutationFn: (input: DuplicateInput) => CollectionClient.duplicate(input),
  });
};

export const useMergePlaylists = () => {
  return useMutation({
    mutationFn: (input: MergePlaylistsInput) => CollectionClient.merge(input),
  });
};

export const useBulkDeleteCollections = () => {
  return useMutation({
    mutationFn: (input: BulkDeleteInput) => CollectionClient.bulkDelete(input),
  });
};

export const useBulkRestoreCollections = () => {
  return useMutation({
    mutationFn: (input: BulkRestoreInput) => CollectionClient.bulkRestore(input),
  });
};

export const usePinCollection = () => {
  return useMutation({
    mutationFn: (input: PinInput) => CollectionClient.pin(input),
  });
};

export const useUnpinCollection = () => {
  return useMutation({
    mutationFn: (input: UnpinInput) => CollectionClient.unpin(input),
  });
};

export const useUndoCollectionAction = () => {
  return useMutation({
    mutationFn: (collectionId: string) => CollectionClient.undo(collectionId),
  });
};

export const useRedoCollectionAction = () => {
  return useMutation({
    mutationFn: (collectionId: string) => CollectionClient.redo(collectionId),
  });
};
