import { songQuery } from '@renderer/queries/songs';
import { invalidateWindowsContainingIds } from '@renderer/hooks/useDataSync';
import { queryClient } from '@renderer/queryClient';
import { useNavigate } from '@tanstack/react-router';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable
} from '@tanstack/react-table';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TableVirtuoso } from 'react-virtuoso';

import Button from '../Button';
import {
  autoNumber,
  bulkApply,
  caseTransform,
  findReplace,
  parsePattern,
  revertSelected,
  type BatchTransformContext,
  type BulkFieldOperation,
  type CaseTransformConfig,
  type FindReplaceConfig,
  type PatternParserConfig
} from './batchTransforms';
import BulkOperationsBar from './BulkOperationsBar';
import BulkSetValuesModal from './BulkSetValuesModal';
import CaseConvertModal from './CaseConvertModal';
import EditableCell from './EditableCell';
import FindReplaceModal from './FindReplaceModal';
import PatternParserModal from './PatternParserModal';
import SaveProgressModal from './SaveProgressModal';
import type { BatchEditStats, BatchTrackData, BatchTrackRow, EditableField } from './types';
import {
  buildCanonicalSongTags,
  formatStringList,
  formatTrackNumber,
  isFieldDirty,
  parseStringList,
  validateField
} from './utils';

export interface BatchSongTagsEditorProps {
  initialSongIds: number[];
  onBack?: () => void;
}

export const BatchSongTagsEditor: React.FC<BatchSongTagsEditorProps> = ({
  initialSongIds,
  onBack
}) => {
  const navigate = useNavigate();

  // Snapshot immutable session song IDs
  const [sessionSongIds] = useState<number[]>(() => [...initialSongIds]);

  const [rows, setRows] = useState<BatchTrackRow[]>([]);
  const [rawTagsMap, setRawTagsMap] = useState<Map<number, SongTags>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  // Tool Modals State
  const [showBulkSetModal, setShowBulkSetModal] = useState(false);
  const [showFindReplaceModal, setShowFindReplaceModal] = useState(false);
  const [showCaseConvertModal, setShowCaseConvertModal] = useState(false);
  const [showPatternParserModal, setShowPatternParserModal] = useState(false);

  // Save coordinator state
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0
  });
  const [saveResults, setSaveResults] = useState<BatchSongItemResult[]>([]);
  const [showProgressModal, setShowProgressModal] = useState(false);

  // Load canonical metadata on mount with bounded concurrency (C=8)
  useEffect(() => {
    let isCancelled = false;

    async function loadMetadata() {
      setIsLoading(true);
      const results: Array<{ id: number; tags?: SongTags; row?: BatchTrackRow } | null> = new Array(
        sessionSongIds.length
      ).fill(null);

      const CONCURRENCY = 8;
      let currentIndex = 0;

      const worker = async () => {
        while (currentIndex < sessionSongIds.length) {
          const index = currentIndex++;
          const id = sessionSongIds[index];
          if (id === undefined) continue;

          try {
            const tags = await window.api.songUpdates.getSongId3Tags(String(id), true);
            if (isCancelled) return;

            const songPath = tags.path || '';
            const trackData: BatchTrackData = {
              songId: id,
              path: songPath,
              duration: tags.duration || 0,
              title: tags.title || '',
              artists: tags.artists?.map((a) => a.name) || [],
              albumArtists: tags.albumArtists?.map((a) => a.name) || [],
              album: tags.albums?.[0]?.title || '',
              genres: tags.genres?.map((g) => g.name) || [],
              trackNumber: tags.trackNumber,
              discNumber: tags.discNumber,
              year: tags.releasedYear,
              composer: tags.composer
            };

            const row: BatchTrackRow = {
              songId: id,
              path: songPath,
              duration: tags.duration || 0,
              original: trackData,
              draft: {
                ...trackData,
                artists: [...trackData.artists],
                albumArtists: [...trackData.albumArtists],
                genres: [...trackData.genres]
              },
              dirtyFields: new Set<EditableField>(),
              validationErrors: new Map<EditableField, string>()
            };

            results[index] = { id, tags, row };
          } catch (err) {
            console.error(`[BatchSongTagsEditor] Failed to load tags for songId ${id}:`, err);
          }
        }
      };

      const workers = Array.from({ length: Math.min(CONCURRENCY, sessionSongIds.length) }, () =>
        worker()
      );
      await Promise.all(workers);

      if (!isCancelled) {
        const tagsMap = new Map<number, SongTags>();
        const loadedRows: BatchTrackRow[] = [];

        for (const item of results) {
          if (item?.tags && item?.row) {
            tagsMap.set(item.id, item.tags);
            loadedRows.push(item.row);
          }
        }

        setRawTagsMap(tagsMap);
        setRows(loadedRows);
        setIsLoading(false);
      }
    }

    if (sessionSongIds.length > 0) {
      loadMetadata();
    } else {
      setIsLoading(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [sessionSongIds]);

  // Handle cell edit mutation
  const handleCellCommit = useCallback(
    (rowIndex: number, field: EditableField, value: string | number | undefined) => {
      setRows((prevRows) => {
        const nextRows = [...prevRows];
        const row = nextRows[rowIndex];
        if (!row) return prevRows;

        const nextDraft = { ...row.draft };

        if (field === 'artists' || field === 'albumArtists' || field === 'genres') {
          nextDraft[field] = typeof value === 'string' ? parseStringList(value) : [];
        } else if (field === 'trackNumber' || field === 'discNumber' || field === 'year') {
          nextDraft[field] = typeof value === 'number' ? value : undefined;
        } else if (field === 'title' || field === 'album' || field === 'composer') {
          nextDraft[field] = typeof value === 'string' ? value : '';
        }

        const nextDirtyFields = new Set(row.dirtyFields);
        if (isFieldDirty(field, row.original, nextDraft)) {
          nextDirtyFields.add(field);
        } else {
          nextDirtyFields.delete(field);
        }

        const nextValidationErrors = new Map(row.validationErrors);
        const error = validateField(field, nextDraft[field]);
        if (error) {
          nextValidationErrors.set(field, error);
        } else {
          nextValidationErrors.delete(field);
        }

        nextRows[rowIndex] = {
          ...row,
          draft: nextDraft,
          dirtyFields: nextDirtyFields,
          validationErrors: nextValidationErrors
        };

        return nextRows;
      });
    },
    []
  );

  // Compute live stats
  const stats: BatchEditStats = useMemo(() => {
    const selectedCount = Object.keys(rowSelection).filter((k) => rowSelection[k]).length;
    const modifiedRows = rows.filter((r) => r.dirtyFields.size > 0);
    const totalFields = rows.reduce((acc, r) => acc + r.dirtyFields.size, 0);
    const hasErrors = rows.some((r) => r.validationErrors.size > 0);

    return {
      totalRows: rows.length,
      selectedCount,
      modifiedTrackCount: modifiedRows.length,
      totalFieldsChanged: totalFields,
      hasValidationErrors: hasErrors
    };
  }, [rows, rowSelection]);

  // Max track number for display zero-padding
  const maxTrackNum = useMemo(() => {
    const nums = rows.map((r) => r.draft.trackNumber ?? 0);
    return Math.max(...nums, rows.length);
  }, [rows]);

  // Discard all changes
  const handleDiscardChanges = useCallback(() => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        draft: {
          ...r.original,
          artists: [...r.original.artists],
          albumArtists: [...r.original.albumArtists],
          genres: [...r.original.genres]
        },
        dirtyFields: new Set<EditableField>(),
        validationErrors: new Map<EditableField, string>()
      }))
    );
  }, []);

  // Save coordinator execution
  const isMountedRef = useRef(true);
  const activeProgressHandlerRef = useRef<
    ((_: unknown, event: BatchTagUpdateProgressEvent) => void) | null
  >(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (activeProgressHandlerRef.current) {
        window.api.songUpdates.removeBatchTagUpdateProgressListener(
          activeProgressHandlerRef.current
        );
        activeProgressHandlerRef.current = null;
      }
    };
  }, []);

  const handleSave = useCallback(async () => {
    const dirtyRows = rows.filter((r) => r.dirtyFields.size > 0);
    if (dirtyRows.length === 0 || stats.hasValidationErrors || isSaving) return;

    setIsSaving(true);
    setSaveProgress({ current: 0, total: dirtyRows.length });
    setSaveResults([]);
    setShowProgressModal(true);

    const progressHandler = (_: unknown, event: BatchTagUpdateProgressEvent) => {
      if (isMountedRef.current) {
        setSaveProgress({ current: event.current, total: event.total });
      }
    };

    activeProgressHandlerRef.current = progressHandler;
    window.api.songUpdates.onBatchTagUpdateProgress(progressHandler);

    try {
      const updates = dirtyRows.map((row) => ({
        songId: row.songId,
        tags: buildCanonicalSongTags(row, rawTagsMap.get(row.songId))
      }));

      const res = await window.api.songUpdates.batchUpdateSongTags(updates);

      // Clean dirty states for successfully saved rows
      const savedIds = new Set(
        res.results.filter((r) => r.status === 'saved').map((r) => r.songId)
      );

      if (savedIds.size > 0) {
        // Surgically invalidate only the hydration windows containing the edited songs.
        // The IPC dataUpdateEvent (songs/updatedSong) will handle broader artist/album/genre
        // invalidation via useDataSync, so we don't need nuclear cache clearing here.
        invalidateWindowsContainingIds(queryClient, savedIds);
        // Refresh IDs in case tag changes affected sort order or filter membership
        void queryClient.invalidateQueries({ queryKey: songQuery.ids._def });
      }

      if (isMountedRef.current) {
        setSaveResults(res.results);
        setRows((prev) =>
          prev.map((r) => {
            if (savedIds.has(r.songId)) {
              return {
                ...r,
                original: {
                  ...r.draft,
                  artists: [...r.draft.artists],
                  albumArtists: [...r.draft.albumArtists],
                  genres: [...r.draft.genres]
                },
                dirtyFields: new Set<EditableField>(),
                validationErrors: new Map<EditableField, string>(),
                status: 'saved'
              };
            }
            const itemRes = res.results.find((item) => item.songId === r.songId);
            if (itemRes) {
              return { ...r, status: itemRes.status, errorMessage: itemRes.message };
            }
            return r;
          })
        );
      }
    } catch (err) {
      console.error('[BatchSongTagsEditor] Batch update failed:', err);
    } finally {
      if (activeProgressHandlerRef.current) {
        window.api.songUpdates.removeBatchTagUpdateProgressListener(
          activeProgressHandlerRef.current
        );
        activeProgressHandlerRef.current = null;
      }
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [rows, stats.hasValidationErrors, isSaving, rawTagsMap]);

  // Column definitions
  const columns = useMemo<ColumnDef<BatchTrackRow>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="accent-font-color-highlight dark:accent-dark-font-color-highlight cursor-pointer"
            aria-label="Select all rows"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="accent-font-color-highlight dark:accent-dark-font-color-highlight cursor-pointer"
            aria-label={`Select track ${row.original.songId}`}
          />
        ),
        enableSorting: false,
        size: 36
      },
      {
        id: 'trackNumber',
        accessorFn: (row) => row.draft.trackNumber,
        header: '#',
        cell: ({ row, getValue }) => (
          <EditableCell
            value={getValue() as number | undefined}
            displayValue={formatTrackNumber(getValue() as number | undefined, maxTrackNum)}
            field="trackNumber"
            type="number"
            placeholder="--"
            isDirty={row.original.dirtyFields.has('trackNumber')}
            errorMessage={row.original.validationErrors.get('trackNumber')}
            onCommit={(field, val) => handleCellCommit(row.index, field, val)}
          />
        ),
        size: 48
      },
      {
        id: 'title',
        accessorFn: (row) => row.draft.title,
        header: 'Title',
        cell: ({ row, getValue }) => (
          <EditableCell
            value={getValue() as string}
            field="title"
            placeholder="Track Title"
            isDirty={row.original.dirtyFields.has('title')}
            errorMessage={row.original.validationErrors.get('title')}
            onCommit={(field, val) => handleCellCommit(row.index, field, val)}
          />
        ),
        size: 180
      },
      {
        id: 'artists',
        accessorFn: (row) => row.draft.artists,
        header: 'Artist(s)',
        cell: ({ row }) => (
          <EditableCell
            value={formatStringList(row.original.draft.artists)}
            field="artists"
            placeholder="Artist names"
            isDirty={row.original.dirtyFields.has('artists')}
            errorMessage={row.original.validationErrors.get('artists')}
            onCommit={(field, val) => handleCellCommit(row.index, field, val)}
          />
        ),
        size: 160
      },
      {
        id: 'album',
        accessorFn: (row) => row.draft.album,
        header: 'Album',
        cell: ({ row, getValue }) => (
          <EditableCell
            value={getValue() as string}
            field="album"
            placeholder="Album Title"
            isDirty={row.original.dirtyFields.has('album')}
            errorMessage={row.original.validationErrors.get('album')}
            onCommit={(field, val) => handleCellCommit(row.index, field, val)}
          />
        ),
        size: 150
      },
      {
        id: 'albumArtists',
        accessorFn: (row) => row.draft.albumArtists,
        header: 'Album Artist',
        cell: ({ row }) => (
          <EditableCell
            value={formatStringList(row.original.draft.albumArtists)}
            field="albumArtists"
            placeholder="Album Artist"
            isDirty={row.original.dirtyFields.has('albumArtists')}
            errorMessage={row.original.validationErrors.get('albumArtists')}
            onCommit={(field, val) => handleCellCommit(row.index, field, val)}
          />
        ),
        size: 140
      },
      {
        id: 'genres',
        accessorFn: (row) => row.draft.genres,
        header: 'Genre(s)',
        cell: ({ row }) => (
          <EditableCell
            value={formatStringList(row.original.draft.genres)}
            field="genres"
            placeholder="Genres"
            isDirty={row.original.dirtyFields.has('genres')}
            errorMessage={row.original.validationErrors.get('genres')}
            onCommit={(field, val) => handleCellCommit(row.index, field, val)}
          />
        ),
        size: 130
      },
      {
        id: 'year',
        accessorFn: (row) => row.draft.year,
        header: 'Year',
        cell: ({ row, getValue }) => (
          <EditableCell
            value={getValue() as number | undefined}
            field="year"
            type="number"
            placeholder="YYYY"
            isDirty={row.original.dirtyFields.has('year')}
            errorMessage={row.original.validationErrors.get('year')}
            onCommit={(field, val) => handleCellCommit(row.index, field, val)}
          />
        ),
        size: 64
      },
      {
        id: 'discNumber',
        accessorFn: (row) => row.draft.discNumber,
        header: 'Disc',
        cell: ({ row, getValue }) => (
          <EditableCell
            value={getValue() as number | undefined}
            field="discNumber"
            type="number"
            placeholder="--"
            isDirty={row.original.dirtyFields.has('discNumber')}
            errorMessage={row.original.validationErrors.get('discNumber')}
            onCommit={(field, val) => handleCellCommit(row.index, field, val)}
          />
        ),
        size: 52
      }
    ],
    [handleCellCommit, maxTrackNum]
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      rowSelection
    },
    enableRowSelection: true,
    getRowId: (row) => String(row.songId),
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const tableRows = table.getRowModel().rows;

  // Selection and Ordering Context for Transforms
  const selectedSongIds = useMemo(() => {
    const ids = new Set<number>();
    for (const [idStr, isSelected] of Object.entries(rowSelection)) {
      if (isSelected) {
        const num = Number(idStr);
        if (!isNaN(num)) ids.add(num);
      }
    }
    return ids;
  }, [rowSelection]);

  const sortedSongIds = useMemo(() => {
    return tableRows.map((r) => r.original.songId);
  }, [tableRows]);

  const transformContext: BatchTransformContext = useMemo(
    () => ({
      rows,
      selectedSongIds,
      sortedSongIds
    }),
    [rows, selectedSongIds, sortedSongIds]
  );

  const hasSelectedDirtyRows = useMemo(() => {
    return Array.from(selectedSongIds).some((id) => {
      const row = rows.find((r) => r.songId === id);
      return row && row.dirtyFields.size > 0;
    });
  }, [selectedSongIds, rows]);

  // Bulk Operations Handlers
  const handleSelectAll = useCallback(() => {
    table.toggleAllRowsSelected(true);
  }, [table]);

  const handleDeselectAll = useCallback(() => {
    table.toggleAllRowsSelected(false);
  }, [table]);

  const handleInvertSelection = useCallback(() => {
    const nextSelection: Record<string, boolean> = {};
    rows.forEach((r) => {
      const idStr = String(r.songId);
      if (!rowSelection[idStr]) {
        nextSelection[idStr] = true;
      }
    });
    setRowSelection(nextSelection);
  }, [rows, rowSelection]);

  const handleSelectModifiedOnly = useCallback(() => {
    const nextSelection: Record<string, boolean> = {};
    rows.forEach((r) => {
      if (r.dirtyFields.size > 0) {
        nextSelection[String(r.songId)] = true;
      }
    });
    setRowSelection(nextSelection);
  }, [rows]);

  const handleAutoNumber = useCallback(() => {
    const result = autoNumber(transformContext, { startNumber: 1, allowAllWhenNoneSelected: true });
    if (result.changedSongIds.length > 0) {
      setRows(result.rows);
    }
  }, [transformContext]);

  const handleApplyBulkSet = useCallback(
    (operations: BulkFieldOperation[]) => {
      const result = bulkApply(transformContext, { operations, allowAllWhenNoneSelected: false });
      if (result.changedSongIds.length > 0) {
        setRows(result.rows);
      }
    },
    [transformContext]
  );

  const handleApplyCaseConvert = useCallback(
    (config: CaseTransformConfig) => {
      const result = caseTransform(transformContext, config);
      if (result.changedSongIds.length > 0) {
        setRows(result.rows);
      }
    },
    [transformContext]
  );

  const handleApplyFindReplace = useCallback(
    (config: FindReplaceConfig) => {
      const result = findReplace(transformContext, config);
      if (result.changedSongIds.length > 0) {
        setRows(result.rows);
      }
    },
    [transformContext]
  );

  const handleApplyPatternParser = useCallback(
    (config: PatternParserConfig) => {
      const result = parsePattern(transformContext, config);
      if (result.changedSongIds.length > 0) {
        setRows(result.rows);
      }
    },
    [transformContext]
  );

  const handleRevertSelected = useCallback(() => {
    const result = revertSelected(transformContext);
    if (result.changedSongIds.length > 0) {
      setRows(result.rows);
    }
  }, [transformContext]);

  const handleNavigateBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      navigate({ to: '/main-player/songs' });
    }
  }, [navigate, onBack]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight animate-spin text-3xl">
            sync
          </span>
          <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-sm font-medium">
            Loading metadata workspace...
          </p>
        </div>
      </div>
    );
  }

  if (sessionSongIds.length === 0 || rows.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="material-icons-round text-font-color-dimmed dark:text-dark-font-color-dimmed text-5xl">
          edit_note
        </span>
        <h2 className="text-font-color-black dark:text-font-color-white text-xl font-semibold">
          No Songs Selected for Batch Editing
        </h2>
        <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed max-w-md text-xs">
          Select multiple tracks in your song list or library, then choose &quot;Edit Tags&quot; to
          open the batch editor workspace.
        </p>
        <Button
          label="Go to Songs"
          iconName="library_music"
          clickHandler={handleNavigateBack}
          className="bg-font-color-highlight dark:bg-dark-font-color-highlight rounded-lg px-4 py-2 text-xs font-medium text-white"
        />
      </div>
    );
  }

  return (
    <div className="bg-background-color-1 dark:bg-dark-background-color-1 flex h-full w-full flex-col overflow-hidden">
      {/* Top Header Bar */}
      <header className="border-background-color-2 dark:border-dark-background-color-2 flex h-14 shrink-0 items-center justify-between border-b px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleNavigateBack}
            className="text-font-color-dimmed hover:bg-background-color-2 hover:text-font-color-black dark:text-dark-font-color-dimmed dark:hover:bg-dark-background-color-2 dark:hover:text-font-color-white flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors"
            title="Back"
          >
            <span className="material-icons-round text-lg">arrow_back</span>
          </button>
          <div>
            <h1 className="text-font-color-black dark:text-font-color-white text-base font-bold">
              Batch Metadata Editor
            </h1>
            <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
              {stats.totalRows} tracks &middot; {stats.selectedCount} selected &middot;{' '}
              <span
                className={
                  stats.modifiedTrackCount > 0
                    ? 'text-font-color-highlight dark:text-dark-font-color-highlight font-medium'
                    : ''
                }
              >
                {stats.modifiedTrackCount} modified
              </span>{' '}
              ({stats.totalFieldsChanged} fields changed)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {stats.modifiedTrackCount > 0 && (
            <Button
              label="Discard Changes"
              iconName="restart_alt"
              clickHandler={handleDiscardChanges}
              className="border-background-color-3/40 text-font-color-dimmed hover:text-font-color-black dark:border-dark-background-color-3/40 dark:text-dark-font-color-dimmed dark:hover:text-font-color-white cursor-pointer rounded-lg border bg-transparent px-3 py-1.5 text-xs font-medium transition-colors"
            />
          )}
          <Button
            label={
              stats.modifiedTrackCount > 0
                ? `Save ${stats.modifiedTrackCount} Tracks`
                : 'Save Tracks'
            }
            iconName="save"
            isDisabled={stats.modifiedTrackCount === 0 || stats.hasValidationErrors || isSaving}
            clickHandler={handleSave}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
              stats.modifiedTrackCount > 0 && !stats.hasValidationErrors
                ? 'bg-font-color-highlight dark:bg-dark-font-color-highlight cursor-pointer text-white hover:opacity-90'
                : 'bg-background-color-2 text-font-color-dimmed dark:bg-dark-background-color-2 dark:text-dark-font-color-dimmed cursor-not-allowed opacity-50'
            }`}
          />
        </div>
      </header>

      {/* Bulk Operations Toolbar */}
      <BulkOperationsBar
        totalCount={stats.totalRows}
        selectedCount={stats.selectedCount}
        modifiedCount={stats.modifiedTrackCount}
        hasSelectedDirtyRows={hasSelectedDirtyRows}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onInvertSelection={handleInvertSelection}
        onSelectModifiedOnly={handleSelectModifiedOnly}
        onAutoNumber={handleAutoNumber}
        onOpenBulkSet={() => setShowBulkSetModal(true)}
        onOpenCaseConvert={() => setShowCaseConvertModal(true)}
        onOpenFindReplace={() => setShowFindReplaceModal(true)}
        onOpenPatternParser={() => setShowPatternParserModal(true)}
        onRevertSelected={handleRevertSelected}
      />

      {/* Main Virtualized Data Table View */}
      <main className="flex-1 overflow-hidden p-4">
        <div className="border-background-color-2 dark:border-dark-background-color-2 h-full w-full overflow-hidden rounded-xl border shadow-sm">
          <TableVirtuoso
            style={{ height: '100%', width: '100%' }}
            totalCount={tableRows.length}
            components={{
              Table: (tableProps) => (
                <table
                  {...tableProps}
                  className="w-full table-fixed border-collapse text-left text-xs"
                >
                  {tableProps.children}
                </table>
              ),
              TableHead: React.forwardRef<
                HTMLTableSectionElement,
                React.HTMLAttributes<HTMLTableSectionElement>
              >((headProps, ref) => (
                <thead
                  {...headProps}
                  ref={ref}
                  className="bg-background-color-2/80 dark:bg-dark-background-color-2/80 text-font-color-dimmed dark:text-dark-font-color-dimmed border-background-color-2 dark:border-dark-background-color-2 sticky top-0 z-10 border-b font-medium backdrop-blur-sm"
                >
                  {headProps.children}
                </thead>
              )),
              TableRow: (rowProps) => {
                const index = rowProps['data-index'];
                const row = tableRows[index];
                const isSelected = row?.getIsSelected();
                const isDirty = row?.original.dirtyFields.size > 0;

                return (
                  <tr
                    {...rowProps}
                    className={`border-background-color-2/40 dark:border-dark-background-color-2/40 border-b transition-colors ${
                      isSelected
                        ? 'bg-font-color-highlight/10 dark:bg-dark-font-color-highlight/10'
                        : isDirty
                          ? 'bg-font-color-highlight/5 dark:bg-dark-font-color-highlight/5'
                          : 'hover:bg-background-color-2/20 dark:hover:bg-dark-background-color-2/20'
                    }`}
                  >
                    {rowProps.children}
                  </tr>
                );
              }
            }}
            fixedHeaderContent={() =>
              table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`px-3 py-2.5 font-semibold transition-colors select-none ${
                        header.column.getCanSort()
                          ? 'hover:bg-background-color-3/40 dark:hover:bg-dark-background-color-3/40 cursor-pointer'
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: (
                            <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight text-sm leading-none">
                              arrow_drop_up
                            </span>
                          ),
                          desc: (
                            <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight text-sm leading-none">
                              arrow_drop_down
                            </span>
                          )
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    </th>
                  ))}
                </tr>
              ))
            }
            itemContent={(index) => {
              const row = tableRows[index];
              if (!row) return null;
              return row.getVisibleCells().map((cell) => (
                <td key={cell.id} style={{ width: cell.column.getSize() }} className="px-1.5 py-1">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ));
            }}
          />
        </div>
      </main>

      {/* Bulk Operations Modals */}
      <BulkSetValuesModal
        isOpen={showBulkSetModal}
        selectedCount={stats.selectedCount}
        onApply={handleApplyBulkSet}
        onClose={() => setShowBulkSetModal(false)}
      />

      <FindReplaceModal
        isOpen={showFindReplaceModal}
        context={transformContext}
        onApply={handleApplyFindReplace}
        onClose={() => setShowFindReplaceModal(false)}
      />

      <CaseConvertModal
        isOpen={showCaseConvertModal}
        context={transformContext}
        onApply={handleApplyCaseConvert}
        onClose={() => setShowCaseConvertModal(false)}
      />

      <PatternParserModal
        isOpen={showPatternParserModal}
        context={transformContext}
        onApply={handleApplyPatternParser}
        onClose={() => setShowPatternParserModal(false)}
      />

      {/* Progress & Completion Modal */}
      <SaveProgressModal
        isOpen={showProgressModal}
        isSaving={isSaving}
        current={saveProgress.current}
        total={saveProgress.total}
        results={saveResults}
        onClose={() => setShowProgressModal(false)}
      />
    </div>
  );
};

export default BatchSongTagsEditor;
