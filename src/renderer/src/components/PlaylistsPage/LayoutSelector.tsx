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
              className={`group relative flex flex-col items-start p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                isSelected && isEnabled
                  ? 'border-neutral-500 bg-neutral-800/90 text-white ring-2 ring-neutral-500/50'
                  : isEnabled
                    ? 'border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                    : 'border-neutral-900 bg-neutral-950/40 text-neutral-600 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex w-full items-center justify-between mb-1.5">
                <span className="material-icons-round text-xl">{def.icon}</span>
                {!isEnabled && (
                  <span className="rounded-full bg-neutral-800/80 px-2 py-0.5 text-[10px] font-semibold text-neutral-400">
                    Coming Soon
                  </span>
                )}
              </div>
              <span className="text-sm font-medium">{def.title}</span>
              <span className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{def.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LayoutSelector;
