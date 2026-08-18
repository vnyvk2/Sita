import React from 'react';
import { MetadataCenterDialog, type MetadataCenterDialogProps } from './MetadataCenterDialog';

export type AlbumAutoTagDialogProps = MetadataCenterDialogProps;

/**
 * Backward-compatible wrapper forwarding to the unified single-page MetadataCenterDialog.
 */
export const AlbumAutoTagDialog: React.FC<AlbumAutoTagDialogProps> = (props) => {
  return <MetadataCenterDialog {...props} />;
};

export { MetadataCenterDialog };
