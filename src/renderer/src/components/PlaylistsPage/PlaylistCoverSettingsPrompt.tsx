import { SpecialPlaylists } from '@common/playlists.enum';
import type { PlaylistDto } from '@main/collections/ipc/dtos';
import { useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { usePlaylistCoverPreview } from '../../hooks/usePlaylistCoverPreview';
import type { AutoCoverStrategyId, CoverLayoutVariant, CoverSlotIndex, PlaylistCoverLayout, PlaylistCoverSettings } from '../../types/playlistCover';
import type { MaterializedCoverDraft } from '../../types/playlistCoverDraft';
import { buildMaterializedCoverDraft, getDraftSongs } from '../../utils/buildMaterializedCoverDraft';
import { isDraftEqual } from '../../utils/isDraftEqual';
import storage from '../../utils/localStorage';
import { serializeDraftToSettings } from '../../utils/serializeDraftToSettings';
import Button from '../Button';
import CoverLivePreview from './CoverLivePreview';
import CoverTypeSelector from './CoverTypeSelector';
import LayoutSelector from './LayoutSelector';
import NumberedSongPicker from './NumberedSongPicker';
import SelectedSongsReorderBar from './SelectedSongsReorderBar';
import VariantSelector from './VariantSelector';

interface Props {
  playlist: PlaylistDto;
  playlistSongs: SongData[];
}

const BADGES = ['①', '②', '③', '④', '⑤'];

const PlaylistCoverSettingsPrompt = ({ playlist, playlistSongs }: Props) => {
  const { changePromptMenuData } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  // Phase 4H Materialized Draft Architecture (Invariants 27, 28, 29, 30)
  const initialMaterializedDraft: MaterializedCoverDraft = useMemo(() => {
    const loaded = storage.playlistCoverSettings.getSettings(playlist.id);
    const loadedSettings: PlaylistCoverSettings = loaded
      ? { version: 1, ...loaded }
      : {
          version: 1,
          type: 'auto',
          collage: {
            layout: 'grid',
            size: 4,
            songIds: []
          }
        };
    return buildMaterializedCoverDraft(loadedSettings, playlistSongs);
  }, [playlist.id, playlistSongs]);

  const [draft, setDraft] = useState<MaterializedCoverDraft>(initialMaterializedDraft);

  // Phase 3D Slot Interaction States
  const [activeSlotIndex, setActiveSlotIndex] = useState<CoverSlotIndex | null>(null);
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<CoverSlotIndex | null>(null);
  const [focusedSlotIndex, setFocusedSlotIndex] = useState<CoverSlotIndex | null>(null);

  const resolvedPreviewCover = usePlaylistCoverPreview({ draft, playlistSongs });

  const isDirty = useMemo(() => {
    return !isDraftEqual(initialMaterializedDraft, draft);
  }, [initialMaterializedDraft, draft]);

  // Reset interactive slot states whenever type, layout, or count changes
  const handleTypeChange = useCallback(
    (newType: PlaylistCoverSettings['type']) => {
      setActiveSlotIndex(null);
      setHoveredSlotIndex(null);
      setFocusedSlotIndex(null);
      setDraft((prev) => {
        if (newType === 'auto') {
          return buildMaterializedCoverDraft(
            { ...serializeDraftToSettings(prev), type: 'auto' },
            playlistSongs
          );
        }
        return { ...prev, type: 'collage' };
      });
    },
    [playlistSongs]
  );

  const handleStrategyChange = useCallback(
    (autoStrategy: AutoCoverStrategyId) => {
      setDraft((prev) => {
        const updatedSettings: PlaylistCoverSettings = {
          ...serializeDraftToSettings(prev),
          type: 'auto',
          autoStrategy
        };
        return buildMaterializedCoverDraft(updatedSettings, playlistSongs);
      });
    },
    [playlistSongs]
  );

  const handleLayoutChange = useCallback((newLayout: PlaylistCoverLayout) => {
    setActiveSlotIndex(null);
    setHoveredSlotIndex(null);
    setFocusedSlotIndex(null);
    setDraft((prev) => {
      const nextSize = (newLayout !== 'diamond' && prev.size > 4 ? 4 : prev.size) as 1 | 2 | 3 | 4 | 5;
      const nextSlots = [...prev.slots];
      if (nextSlots.length > nextSize) {
        nextSlots.splice(nextSize);
      } else {
        while (nextSlots.length < nextSize) {
          nextSlots.push({ songId: null });
        }
      }

      return {
        ...prev,
        layout: newLayout,
        variant: undefined,
        size: nextSize,
        slots: nextSlots
      };
    });
  }, []);

  const handleVariantChange = useCallback((newVariant: CoverLayoutVariant) => {
    setDraft((prev) => ({
      ...prev,
      variant: newVariant
    }));
  }, []);

  const handleSizeChange = useCallback((newSize: 1 | 2 | 3 | 4 | 5) => {
    setActiveSlotIndex(null);
    setHoveredSlotIndex(null);
    setFocusedSlotIndex(null);
    setDraft((prev) => {
      const nextSlots = [...prev.slots];
      if (nextSlots.length > newSize) {
        nextSlots.splice(newSize);
      } else {
        while (nextSlots.length < newSize) {
          nextSlots.push({ songId: null });
        }
      }
      return {
        ...prev,
        size: newSize,
        slots: nextSlots
      };
    });
  }, []);

  const handleSelectSlot = useCallback((slot: CoverSlotIndex) => {
    setActiveSlotIndex((prev) => (prev === slot ? null : slot));
  }, []);

  const handleSwapSlots = useCallback((fromIndex: CoverSlotIndex, toIndex: CoverSlotIndex) => {
    setDraft((prev) => {
      const newSlots = [...prev.slots];
      const temp = newSlots[fromIndex];
      newSlots[fromIndex] = newSlots[toIndex];
      newSlots[toIndex] = temp;

      return {
        ...prev,
        type: 'collage',
        slots: newSlots
      };
    });
  }, []);

  const handleClearSlot = useCallback((slot: CoverSlotIndex) => {
    setDraft((prev) => {
      const newSlots = [...prev.slots];
      if (slot < newSlots.length) {
        newSlots[slot] = { songId: null };
      }

      return {
        ...prev,
        type: 'collage',
        slots: newSlots
      };
    });
    setActiveSlotIndex((prev) => (prev === slot ? null : prev));
  }, []);

  const handleToggleSong = useCallback(
    (songId: number) => {
      setDraft((prev) => {
        const newSlots = [...prev.slots];
        const currentIds = newSlots.map((s) => s.songId);

        // Targeted Replacement Mode
        if (activeSlotIndex !== null) {
          const existingIndex = currentIds.indexOf(songId);
          if (existingIndex !== -1 && existingIndex !== activeSlotIndex) {
            newSlots[existingIndex] = { songId: null };
          }
          while (newSlots.length <= activeSlotIndex) {
            newSlots.push({ songId: null });
          }
          newSlots[activeSlotIndex] = { songId };

          return {
            ...prev,
            type: 'collage',
            slots: newSlots
          };
        }

        // Standard Append / Remove Mode
        const isSelected = currentIds.includes(songId);
        if (isSelected) {
          return {
            ...prev,
            type: 'collage',
            slots: newSlots.map((s) => (s.songId === songId ? { songId: null } : s))
          };
        }

        // Find first empty slot (null)
        const emptyIndex = currentIds.indexOf(null);
        if (emptyIndex !== -1) {
          newSlots[emptyIndex] = { songId };
        } else if (newSlots.length < prev.size) {
          newSlots.push({ songId });
        }

        return {
          ...prev,
          type: 'collage',
          slots: newSlots
        };
      });

      // Clear active slot after targeted replacement
      if (activeSlotIndex !== null) {
        setActiveSlotIndex(null);
      }
    },
    [activeSlotIndex]
  );

  const handleReset = useCallback(() => {
    setActiveSlotIndex(null);
    setHoveredSlotIndex(null);
    setFocusedSlotIndex(null);
    setDraft(initialMaterializedDraft);
  }, [initialMaterializedDraft]);

  const handleSave = useCallback(() => {
    if (!isDirty || !playlist?.id || SpecialPlaylists.isSpecialPlaylistId(playlist.id)) return;
    const settingsToSave = serializeDraftToSettings(draft);
    storage.playlistCoverSettings.setSettings(playlist.id, settingsToSave);
    changePromptMenuData(false);
  }, [changePromptMenuData, isDirty, playlist?.id, draft]);

  const currentSize = draft.size;
  const isDiamond = draft.layout === 'diamond';
  const availableCounts = isDiamond ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];

  // Derived effective songs directly from materialized draft
  const effectiveSongs = useMemo(() => {
    return getDraftSongs(draft, playlistSongs);
  }, [draft, playlistSongs]);

  return (
    <div className="flex w-full max-w-[880px] flex-col p-6 text-font-color-black dark:text-font-color-white max-h-[85vh] bg-neutral-900/95 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden mx-auto">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between border-b border-neutral-800 pb-3 shrink-0">
        <span className="text-xl font-bold tracking-tight">
          {t('playlistsPage.coverSettingsTitle', 'Customize Playlist Cover')}
        </span>
        {isDirty && (
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20">
            Unsaved Changes
          </span>
        )}
      </div>

      {/* Two-Column Desktop Workstation Shell */}
      <div className="flex flex-row gap-6 min-h-0 flex-1 overflow-hidden">
        {/* Left Column (~360px Sticky Preview & Reorder Slot) */}
        <div className="w-[360px] shrink-0 flex flex-col gap-4 sticky top-0 self-start">
          {/* Production-Identical Live Preview */}
          <CoverLivePreview
            resolvedCover={resolvedPreviewCover}
            requestedCount={currentSize}
            activeSlotIndex={activeSlotIndex}
            hoveredSlotIndex={hoveredSlotIndex}
            focusedSlotIndex={focusedSlotIndex}
            onSelectSlot={handleSelectSlot}
            onHoverSlot={setHoveredSlotIndex}
          />

          {/* Interactive Selected Songs Drag-and-Drop Reorder Bar */}
          {draft.type === 'collage' && (
            <SelectedSongsReorderBar
              effectiveSongs={effectiveSongs}
              maxSize={currentSize}
              activeSlotIndex={activeSlotIndex}
              hoveredSlotIndex={hoveredSlotIndex}
              focusedSlotIndex={focusedSlotIndex}
              onSelectSlot={handleSelectSlot}
              onHoverSlot={setHoveredSlotIndex}
              onSwapSlots={handleSwapSlots}
              onClearSlot={handleClearSlot}
            />
          )}
        </div>

        {/* Right Column (Scrollable Controls & Song Picker) */}
        <div className="flex-1 min-w-0 overflow-y-auto pr-1 flex flex-col gap-6">
          {/* Cover Mode Selector */}
          <CoverTypeSelector
            type={draft.type}
            autoStrategy={draft.autoStrategy}
            onTypeChange={handleTypeChange}
            onStrategyChange={handleStrategyChange}
          />

          {draft.type === 'collage' && (
            <>
              {/* Layout Geometry Preset Selector */}
              <LayoutSelector
                selectedLayout={draft.layout}
                selectedSize={currentSize}
                availableCounts={availableCounts}
                onLayoutChange={handleLayoutChange}
                onSizeChange={handleSizeChange}
              />

              {/* Sub-style Variant Selector */}
              <VariantSelector
                layout={draft.layout}
                selectedVariant={draft.variant}
                onVariantChange={handleVariantChange}
              />

              {/* Numbered Song Picker */}
              <NumberedSongPicker
                playlistSongs={playlistSongs}
                selectedSongIds={draft.slots.map((s) => s.songId).filter((id): id is number => id !== null)}
                activeSlotIndex={activeSlotIndex}
                maxSize={currentSize}
                onToggleSong={handleToggleSong}
                badges={BADGES}
              />
            </>
          )}
        </div>
      </div>

      {/* Footer Controls */}
      <div className="mt-5 flex items-center justify-end gap-3 border-t border-neutral-800 pt-4 shrink-0">
        <Button
          label={t('common.reset', 'Reset')}
          className="mr-0"
          clickHandler={handleReset}
          isDisabled={!isDirty}
        />
        <Button
          label={t('common.cancel', 'Cancel')}
          className="mr-0"
          clickHandler={() => changePromptMenuData(false)}
        />
        <Button
          label={t('common.save', 'Save Changes')}
          className="bg-amber-500! hover:bg-amber-400! text-neutral-950! font-bold! border-none! mr-0"
          clickHandler={handleSave}
          isDisabled={!isDirty}
        />
      </div>
    </div>
  );
};

export default PlaylistCoverSettingsPrompt;
