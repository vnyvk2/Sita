import { PlaylistRepository } from './repositories/PlaylistRepository';
import { MembershipService } from './membership/MembershipService';
import { MembershipCache } from './membership/MembershipCache';
import { PlaylistMembershipSource } from './membership/sources/PlaylistMembershipSource';
import { OperationExecutor } from './operations/OperationExecutor';
import { OperationJournalWriter } from './operations/OperationJournalWriter';
import { PlaylistEngine } from './engine/PlaylistEngine';
import { UndoEngine } from './engine/UndoEngine';
import { OperationRegistry } from './operations/OperationRegistry';
import { OperationJournalRepository } from './repositories/OperationJournalRepository';
import { HierarchyService } from './engine/HierarchyService';
import { DeleteOp } from './operations/DeleteOp';
import { CreateFolderOp } from './operations/CreateFolderOp';
import { DuplicateOp } from './operations/DuplicateOp';
import { DuplicatePlanner } from './operations/DuplicatePlanner';
import { DuplicateExecutor } from './operations/DuplicateExecutor';
import { MergePlaylistsOp } from './operations/MergePlaylistsOp';
import { RenameOp } from './operations/RenameOp';
import { MoveCollectionOp, RestoreMoveOp } from './operations/MoveCollectionOp';
import { RestorePlaylistOp } from './operations/RestorePlaylistOp';
import { AddSongsOp } from './operations/AddSongsOp';
import { RemoveSongsOp } from './operations/RemoveSongsOp';
import { ReorderOp } from './operations/ReorderOp';
import { RestoreSongsOp } from './operations/RestoreSongsOp';
import { SetArtworkOp } from './operations/SetArtworkOp';

// Singletons for Collections Backend
export const playlistRepository = new PlaylistRepository();
export const operationJournalWriter = new OperationJournalWriter();
export const executor = new OperationExecutor(operationJournalWriter);
export const membershipCache = new MembershipCache();
export const playlistMembershipSource = new PlaylistMembershipSource(playlistRepository);
export const membershipService = new MembershipService(membershipCache, [playlistMembershipSource]);
export const playlistEngine = new PlaylistEngine(playlistRepository, membershipService, executor);
export const hierarchyService = new HierarchyService();
export function registerDefaultOperations(
  reg: OperationRegistry,
  repo: PlaylistRepository,
  hierarchy: HierarchyService
) {
  reg.register('playlist.delete', new DeleteOp(repo));
  reg.register('playlist.createFolder', new CreateFolderOp(repo));
  reg.register('playlist.duplicate', new DuplicateOp(new DuplicatePlanner(hierarchy), new DuplicateExecutor()));
  reg.register('playlist.merge', new MergePlaylistsOp(repo));
  reg.register('playlist.rename', new RenameOp(repo));
  reg.register('playlist.move', new MoveCollectionOp(hierarchy));
  reg.register('playlist.restoreMove', new RestoreMoveOp());
  reg.register('playlist.restore', new RestorePlaylistOp(repo));
  reg.register('playlist.addSongs', new AddSongsOp(repo));
  reg.register('playlist.removeSongs', new RemoveSongsOp(repo));
  reg.register('playlist.reorder', new ReorderOp(repo));
  reg.register('playlist.restoreSongs', new RestoreSongsOp(repo));
  reg.register('playlist.setArtwork', new SetArtworkOp(repo));
}

export const registry = new OperationRegistry();
registerDefaultOperations(registry, playlistRepository, hierarchyService);

export const journalRepo = new OperationJournalRepository();
export const undoEngine = new UndoEngine(registry, journalRepo, executor, membershipService);

// Wire journal writer to prune redo branches automatically
operationJournalWriter.setPointerProvider((id) => undoEngine.getCurrentPointer(id));
