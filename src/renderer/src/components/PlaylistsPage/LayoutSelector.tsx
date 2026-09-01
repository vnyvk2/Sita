import { COVER_LAYOUT_DEFINITIONS } from '../../constants/coverLayoutRegistry';
import type { PlaylistCoverLayout } from '../../types/playlistCover';

type Props = {
  selectedLayout: PlaylistCoverLayout;
  onChange: (layout: PlaylistCoverLayout) => void;
};

const LayoutSelector = ({ selectedLayout, onChange }: Props) => {
  return (
    <div className="layout-selector mb-6">
      <label className="mb-2 block text-sm font-semibold text-neutral-300">Collage Layout</label>
      <div className="grid grid-cols-2 gap-3">
        {COVER_LAYOUT_DEFINITIONS.map((def) => {
          const isSelected = selectedLayout === def.id;
          const isEnabled = def.enabled;

          return (
            <button
              key={def.id}
              type="button"
              disabled={!isEnabled}
              onClick={() => isEnabled && onChange(def.id)}
              className={`group relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                isSelected && isEnabled
                  ? 'cursor-pointer border-neutral-500 bg-neutral-800/90 text-white shadow-md ring-2 ring-neutral-500/50'
                  : isEnabled
                    ? 'cursor-pointer border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                    : 'cursor-not-allowed border-neutral-900 bg-neutral-950/40 text-neutral-600 opacity-50'
              }`}
            >
              {/* Visual Mini-Diagram Icon Box */}
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  isSelected && isEnabled
                    ? 'border-amber-400/50 bg-amber-500/10 text-amber-400'
                    : isEnabled
                      ? 'border-neutral-700 bg-neutral-800/60 text-neutral-400 group-hover:text-neutral-200'
                      : 'border-neutral-800 bg-neutral-900/40 text-neutral-600'
                }`}
              >
                <span className="material-icons-round text-xl">{def.icon}</span>
              </div>

              {/* Layout Info & Status Badge */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-sm font-medium">{def.title}</span>
                  {!isEnabled && (
                    <span className="shrink-0 rounded-full border border-neutral-700/50 bg-neutral-800/90 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-neutral-400 uppercase">
                      Coming Soon
                    </span>
                  )}
                </div>
                <span className="mt-0.5 line-clamp-1 text-xs text-neutral-500">
                  {def.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LayoutSelector;
