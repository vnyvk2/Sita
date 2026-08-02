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
              className={`group relative flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 ${
                isSelected && isEnabled
                  ? 'border-neutral-500 bg-neutral-800/90 text-white ring-2 ring-neutral-500/50 shadow-md cursor-pointer'
                  : isEnabled
                    ? 'border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200 cursor-pointer'
                    : 'border-neutral-900 bg-neutral-950/40 text-neutral-600 opacity-50 cursor-not-allowed'
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
              <div className="flex flex-1 flex-col min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium truncate">{def.title}</span>
                  {!isEnabled && (
                    <span className="shrink-0 rounded-full bg-neutral-800/90 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase text-neutral-400 border border-neutral-700/50">
                      Coming Soon
                    </span>
                  )}
                </div>
                <span className="text-xs text-neutral-500 line-clamp-1 mt-0.5">{def.description}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LayoutSelector;
