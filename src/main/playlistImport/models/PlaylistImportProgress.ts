import type { PlaylistImportStage } from './PlaylistImportStage';

export interface PlaylistImportProgress {
  stage: PlaylistImportStage;
  message: string;
  percentage: number;
  itemIndex?: number;
  totalItems?: number;
}
