import type { CoverSlotIndex } from '../../types/playlistCover';
import DefaultImgCover from '../../assets/images/webp/song_cover_default.webp';
import Img from '../Img';

interface Props {
  effectiveSongs: SongData[];
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
  effectiveSongs,
  maxSize,
  activeSlotIndex,
  hoveredSlotIndex,
  focusedSlotIndex,
  onSelectSlot,
  onHoverSlot,
  onSwapSlots,
  onClearSlot
}: Props) => {
  const formatArtists = (artists?: any) => {
    if (!Array.isArray(artists) || artists.length === 0) return '';
    return artists
      .map((a) => (typeof a === 'string' ? a : a?.name || ''))
      .filter(Boolean)
      .join(', ');
  };

  return (
    <div className="mb-6 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-neutral-300">Selected Cover Slots</label>
        <span className="text-xs font-medium text-neutral-400">
          {effectiveSongs.length} / {maxSize} Slots Filled
        </span>
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-neutral-900/80 p-2 border border-neutral-800">
        {Array.from({ length: maxSize }).map((_, i) => {
          const slotIndex = i as CoverSlotIndex;
          const song = effectiveSongs[i];
          const isActive = activeSlotIndex === slotIndex;
          const isHovered = hoveredSlotIndex === slotIndex;
          const isFocused = focusedSlotIndex === slotIndex;
          const artistText = formatArtists(song?.artists);

          return (
            <div
              key={i}
              onClick={() => onSelectSlot(slotIndex)}
              onMouseEnter={() => onHoverSlot(slotIndex)}
              onMouseLeave={() => onHoverSlot(null)}
              className={`group relative flex items-center justify-between rounded-lg p-2 transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-amber-500/15 border-2 border-amber-500/80 shadow-md ring-2 ring-amber-500/30'
                  : isHovered || isFocused
                    ? 'bg-neutral-800 border border-neutral-700'
                    : 'bg-neutral-950/60 border border-neutral-800/80 hover:bg-neutral-800/60'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
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
                    title="Clear Slot"
                    onClick={() => onClearSlot(slotIndex)}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors ml-1"
                  >
                    ×
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
