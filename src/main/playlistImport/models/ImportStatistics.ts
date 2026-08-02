export interface ImportStatistics {
  totalEntries: number;
  importedEntries: number;
  repairedEntries: number;
  skippedEntries: number;
  missingEntries: number;
  notInLibraryEntries: number;
  invalidEntries: number;
  warningCount: number;
  plannedImportPercentage: number;
}
