import React from 'react';

import {
  MetadataCenterDialog as AutotagMetadataCenterDialog,
  type MetadataCenterDialogProps
} from '../autotag/MetadataCenterDialog';

export type { MetadataCenterDialogProps };

/** Forwarding wrapper to the unified single-page MetadataCenterDialog. */
export const MetadataCenterDialog: React.FC<MetadataCenterDialogProps> = (props) => {
  return <AutotagMetadataCenterDialog {...props} />;
};

export default MetadataCenterDialog;
