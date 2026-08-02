import { useState } from 'react';
import type { CoverSlotIndex, EffectiveCoverSlot } from '../../types/playlistCover';
import DefaultImgCover from '../../assets/images/webp/song_cover_default.webp';
import Img from '../Img';

interface Props {
  effectiveSongs?: (SongData | undefined)[];
  effectiveSlots?: EffectiveCoverSlot[];
  maxSize: number;
  activeSlotIndex: CoverSlotIndex | null;
  hoveredSlotIndex: CoverSlotIndex | null;
  focusedSlotIndex: CoverSlotIndex | null;
  onSelectSlot: (slot: CoverSlotIndex) => void;
  onHoverSlot: (slot: CoverSlotIndex | null) => void;
  onSwapSlots: (fromIndex: CoverSlotIndex, toIndex: CoverSlotIndex) => void;
  onClearSlot: (slot: CoverSlotIndex) => void;
}

const BADGES = ['①', '②', '③', '④', '⑤'];

const SelectedSongsReorderBar = ({
  effectiveSongs = [],
  effectiveSlots,
  maxSize,
  activeSlotIndex,
  hoveredSlotIndex,
  focusedSlotIndex,
  onSelectSlot,
  onHoverSlot,
  onSwapSlots,
  onClearSlot
}: Props) => {
  const [statusAnnouncement, setStatusAnnouncement] = useState<string>('');

  const handleSwapWithAnnouncement = (from: CoverSlotIndex, to: CoverSlotIndex) => {
    onSwapSlots(from, to);
    setStatusAnnouncement(`Moved slot ${from + 1} to position ${to + 1}`);
  };

  const formatArtists = (artists?: any) => {
    if (!Array.isArray(artists) || artists.length === 0) return '';
    return artists
      .map((a) => (typeof a === 'string' ? a : a?.name || ''))
      .filter(Boolean)
      .join(', ');
  };

  return (
    <div className="mb-6 flex flex-col gap-2">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {statusAnnouncement}
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-neutral-300">Selected Cover Slots</label>
        <span className="text-xs font-medium text-neutral-400">
          Drag cards to reorder
        </span>
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-neutral-900/80 p-2 border border-neutral-800" role="listbox" aria-label="Cover slots list">
        {Array.from({ length: maxSize }).map((_, i) => {
          const slotIndex = i as CoverSlotIndex;
          const slotData = effectiveSlots ? effectiveSlots[i] : undefined;
          const song = slotData ? slotData.song : effectiveSongs[i];
          const isDraggable = slotData ? slotData.draggable : true;

          const isActive = activeSlotIndex === slotIndex;
          const isHovered = hoveredSlotIndex === slotIndex;
          const isFocused = focusedSlotIndex === slotIndex;
          const isDragging = draggingSlot === slotIndex;
          const isDragOver = dragOverSlot === slotIndex;

          const artistText = formatArtists(song?.artists);

          return (
            <div
              key={i}
              draggable={isDraggable}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', String(slotIndex));
                e.dataTransfer.effectAllowed = 'move';
                setDraggingSlot(slotIndex);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverSlot !== slotIndex) {
                  setDragOverSlot(slotIndex);
                }
              }}
              onDragLeave={() => {
                if (dragOverSlot === slotIndex) {
                  setDragOverSlot(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fromIndexStr = e.dataTransfer.getData('text/plain');
                const fromIndex = Number(fromIndexStr);
                if (!isNaN(fromIndex) && fromIndex !== slotIndex) {
                  handleSwapWithAnnouncement(fromIndex as CoverSlotIndex, slotIndex);
                }
                setDraggingSlot(null);
                setDragOverSlot(null);
              }}
              onDragEnd={() => {
                setDraggingSlot(null);
                setDragOverSlot(null);
              }}
              tabIndex={0}
              role="option"
              aria-selected={isActive}
              aria-label={`Cover Slot ${i + 1}: ${song?.title || 'Empty'}`}
              onClick={() => onSelectSlot(slotIndex)}
              onMouseEnter={() => onHoverSlot(slotIndex)}
              onMouseLeave={() => onHoverSlot(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectSlot(slotIndex);
                } else if (e.key === 'ArrowUp' && i > 0) {
                  e.preventDefault();
                  handleSwapWithAnnouncement(slotIndex, (i - 1) as CoverSlotIndex);
                } else if (e.key === 'ArrowDown' && i < maxSize - 1) {
                  e.preventDefault();
                  handleSwapWithAnnouncement(slotIndex, (i + 1) as CoverSlotIndex);
                }
              }}
              className={`group relative flex items-center justify-between rounded-lg p-2 transition-all duration-150 ease-out cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                isDragging ? 'opacity-40 scale-95 border-dashed border-amber-400' : ''
              } ${
                isDragOver ? 'ring-2 ring-amber-400 bg-amber-500/20 scale-[1.02]' : ''
              } ${
                isActive
                  ? 'bg-amber-500/15 border-2 border-amber-500/80 shadow-lg ring-2 ring-amber-500/30 scale-[1.01]'
                  : isHovered || isFocused
                    ? 'bg-neutral-800 border border-neutral-700 scale-[1.01] shadow-md'
                    : 'bg-neutral-950/60 border border-neutral-800/80 hover:bg-neutral-800/60'
              }`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                {/* Drag Grip Handle */}
                <span className="text-neutral-500 text-xs font-mono select-none px-0.5 cursor-grab">
                  ⋮⋮
                </span>

                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold text-neutral-200 shrink-0">
                  {BADGES[i]}
                </span>

                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-neutral-700/60">
                  <Img
                    src={song?.artworkPaths?.artworkPath || DefaultImgCover}
                    fallbackSrc={DefaultImgCover}
                    alt={song?.title || 'Default Cover'}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="flex flex-col overflow-hidden">
                  <span className={`truncate text-xs font-semibold ${song ? 'text-neutral-200' : 'text-neutral-500 italic'}`}>
                    {song?.title || 'Empty Slot (Default Cover)'}
                  </span>
                  {artistText && (
                    <span className="truncate text-[11px] text-neutral-400">
                      {artistText}
                    </span>
                  )}
                </div>
              </div>

              {/* Slot Actions: Swap & Clear */}
              <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 shrink-0" onClick={(e) => e.stopPropagation()}>
                {i > 0 && (
                  <button
                    type="button"
                    title="Move Up / Swap Left"
                    onClick={() => onSwapSlots(slotIndex, (i - 1) as CoverSlotIndex)}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
                  >
                    ◀
                  </button>
                )}
                {i < maxSize - 1 && (
                  <button
                    type="button"
                    title="Move Down / Swap Right"
                    onClick={() => onSwapSlots(slotIndex, (i + 1) as CoverSlotIndex)}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
                  >
                    ▶
                  </button>
                )}
                {song && (
                  <button
                    type="button"
                    title="Reset to Auto Selection"
                    onClick={() => onClearSlot(slotIndex)}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-800 text-neutral-400 hover:bg-amber-500/20 hover:text-amber-300 transition-colors ml-1"
                  >
                    ↺
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SelectedSongsReorderBar;
