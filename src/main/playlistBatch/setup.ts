import { collectionEventBus } from '../collections/events/CollectionEventBus';
import { playlistRepository } from '../collections/setup';
import { playlistImportWorkflow } from '../playlistImport/setup';
import { PlaylistBatchOrchestrator } from './orchestrator/PlaylistBatchOrchestrator';
import { PlaylistBatchPlanner } from './planner/PlaylistBatchPlanner';
import { PlaylistDependencyGraph } from './planner/PlaylistDependencyGraph';

export const playlistDependencyGraph = new PlaylistDependencyGraph();
export const playlistBatchPlanner = new PlaylistBatchPlanner(playlistDependencyGraph);
export const playlistBatchOrchestrator = new PlaylistBatchOrchestrator(
  playlistImportWorkflow,
  undefined,
  playlistRepository,
  collectionEventBus
);
