import { playlistEngine } from '../collections/setup';
import { M3UImporter } from './importers/M3UImporter';
import { PlaylistImportPipeline } from './pipeline/PlaylistImportPipeline';
import { PlaylistImportPlanner } from './planner/PlaylistImportPlanner';
import { PlaylistImporterRegistry } from './registry/PlaylistImporterRegistry';
import { RepairStrategyRegistry } from './registry/RepairStrategyRegistry';
import { PlaylistRepairEngine } from './repair/PlaylistRepairEngine';
import { LibraryResolver } from './resolver/LibraryResolver';
import { PlaylistPathResolver } from './resolver/PlaylistPathResolver';
import { ExactFilenameStrategy } from './strategies/ExactFilenameStrategy';
import { NormalizedFilenameStrategy } from './strategies/NormalizedFilenameStrategy';
import { TitleMatchStrategy } from './strategies/TitleMatchStrategy';
import { DrizzleLibraryLookup } from './services/DrizzleLibraryLookup';
import { DrizzleTransactionRunner } from './services/DrizzleTransactionRunner';
import { EnginePlaylistPersistence } from './services/EnginePlaylistPersistence';
import { InMemoryPlaylistImportHistoryRepository } from './services/InMemoryPlaylistImportHistoryRepository';
import { NodeFileSystemAccess } from './services/NodeFileSystemAccess';
import { PlaylistImportHistoryService } from './services/PlaylistImportHistoryService';
import { PlaylistImportService } from './services/PlaylistImportService';
import { PlaylistImportSessionService } from './services/PlaylistImportSessionService';
import { RepairSummaryBuilder } from './services/RepairSummaryBuilder';
import { FilesystemVerifier } from './verifier/FilesystemVerifier';
import { PlaylistImportWorkflow } from './workflow/PlaylistImportWorkflow';
import { PlaylistImportExecutor } from './executor/PlaylistImportExecutor';

// 1. Importer Registry & Service
export const importerRegistry = new PlaylistImporterRegistry();
importerRegistry.register(new M3UImporter());
export const importService = new PlaylistImportService(importerRegistry);

// 2. Path Resolver & Filesystem Verifier
export const pathResolver = new PlaylistPathResolver();
export const fileSystemAccess = new NodeFileSystemAccess();
export const verifier = new FilesystemVerifier(fileSystemAccess);

// 3. Library Resolver & Candidate Provider
export const libraryLookup = new DrizzleLibraryLookup();
export const libraryResolver = new LibraryResolver(libraryLookup);

// 4. Intelligent Repair Engine
export const repairStrategyRegistry = new RepairStrategyRegistry();
repairStrategyRegistry.register(new ExactFilenameStrategy());
repairStrategyRegistry.register(new NormalizedFilenameStrategy());
repairStrategyRegistry.register(new TitleMatchStrategy());
export const repairEngine = new PlaylistRepairEngine(repairStrategyRegistry, libraryLookup);

// 5. Import Planner & Pipeline
export const planner = new PlaylistImportPlanner();
export const importPipeline = new PlaylistImportPipeline(
  importService,
  pathResolver,
  verifier,
  libraryResolver,
  planner,
  repairEngine
);

// 6. Persistence & Executor
export const enginePersistence = new EnginePlaylistPersistence(playlistEngine);
export const transactionRunner = new DrizzleTransactionRunner();
export const importExecutor = new PlaylistImportExecutor(enginePersistence, transactionRunner);

// 7. Session & History Subsystem
export const historyRepository = new InMemoryPlaylistImportHistoryRepository();
export const summaryBuilder = new RepairSummaryBuilder();
export const importSessionService = new PlaylistImportSessionService(historyRepository, summaryBuilder);
export const importHistoryService = new PlaylistImportHistoryService(historyRepository, enginePersistence);

// 8. Canonical Playlist Import Workflow Orchestrator
export const playlistImportWorkflow = new PlaylistImportWorkflow(
  importPipeline,
  importExecutor,
  importSessionService
);
