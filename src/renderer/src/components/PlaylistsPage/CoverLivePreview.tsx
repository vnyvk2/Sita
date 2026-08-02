import type { CoverLayoutVariant, CoverSlotIndex, PlaylistCoverLayout, ResolvedPlaylistCover } from '../../types/playlistCover';
import { getLayoutClipPaths } from '../../utils/getLayoutClipPaths';
import MultipleArtworksCover from './MultipleArtworksCover';

type Props = {
  resolvedCover: ResolvedPlaylistCover;
  requestedCount?: number;
  variant?: CoverLayoutVariant;
  activeSlotIndex?: CoverSlotIndex | null;
  hoveredSlotIndex?: CoverSlotIndex | null;
  focusedSlotIndex?: CoverSlotIndex | null;
  onSelectSlot?: (slot: CoverSlotIndex) => void;
  onHoverSlot?: (slot: CoverSlotIndex | null) => void;
};

const BADGES = ['①', '②', '③', '④', '⑤'];

const CoverLivePreview = ({
  resolvedCover,
  requestedCount,
  variant,
  activeSlotIndex,
  hoveredSlotIndex,
  focusedSlotIndex,
  onSelectSlot,
  onHoverSlot
}: Props) => {
  const count = requestedCount ?? resolvedCover.artworks.length ?? 4;
  const activeVariant = variant || resolvedCover.variant;
  const clipPaths = getLayoutClipPaths(resolvedCover.layout as PlaylistCoverLayout, activeVariant, count);

  return (
    <div className="cover-live-preview mb-6 flex flex-col items-center">
      <div className="mb-2 flex w-full items-center justify-between">
        <label className="text-sm font-semibold text-neutral-300">Live Preview</label>
        <span className="text-xs text-neutral-400 font-medium">Click any region to select slot</span>
      </div>

      <div className="relative h-48 w-48 overflow-hidden rounded-2xl border-2 border-neutral-700/80 shadow-2xl bg-neutral-900 transition-all duration-200 ease-out hover:shadow-[0_0_30px_rgba(251,191,36,0.15)] hover:border-neutral-600">
        {/* Render Presentation Cover Engine */}
        <MultipleArtworksCover
          resolvedArtworks={resolvedCover.artworks}
          layout={resolvedCover.layout}
          variant={activeVariant}
          requestedCount={count}
          className="h-full w-full"
        />

        {/* Single Source of Truth Interactive Overlay Layer */}
        <div className="absolute inset-0 pointer-events-auto">
          {clipPaths.slice(0, count).map((clipPath, i) => {
            const slotIndex = i as CoverSlotIndex;
            const isActive = activeSlotIndex === slotIndex;
            const isHovered = hoveredSlotIndex === slotIndex;
            const isFocused = focusedSlotIndex === slotIndex;

            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelectSlot?.(slotIndex)}
                onMouseEnter={() => onHoverSlot?.(slotIndex)}
                onMouseLeave={() => onHoverSlot?.(null)}
                style={{ clipPath }}
                className={`absolute inset-0 transition-all duration-150 ease-out cursor-pointer flex items-center justify-center ${
                  isActive
                    ? 'bg-amber-500/25 ring-4 ring-amber-400/90 z-30 shadow-2xl scale-[1.01]'
                    : isHovered
                      ? 'bg-amber-400/15 ring-2 ring-amber-300/80 z-20 scale-[1.01]'
                      : isFocused
                        ? 'bg-blue-400/15 ring-2 ring-blue-400/80 z-20'
                        : 'hover:bg-neutral-900/10'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black shadow-lg transition-transform duration-150 ease-out ${
                    isActive
                      ? 'bg-amber-500 text-neutral-950 scale-125 ring-2 ring-white shadow-[0_0_15px_rgba(245,158,11,0.6)]'
                      : isHovered
                        ? 'bg-neutral-100 text-neutral-900 scale-110 shadow-md'
                        : 'bg-neutral-900/90 text-neutral-100 border border-neutral-700'
                  }`}
                >
                  {BADGES[i]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CoverLivePreview;
