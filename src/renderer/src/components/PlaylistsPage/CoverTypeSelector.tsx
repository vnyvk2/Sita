import type { AutoCoverStrategyId, PlaylistCoverSettings } from '../../types/playlistCover';
import { getAllAutoCoverStrategies } from '../../utils/autoCoverStrategies/AutoCoverStrategyRegistry';

type Props = {
  type: PlaylistCoverSettings['type'];
  autoStrategy?: AutoCoverStrategyId;
  onChangeType: (type: PlaylistCoverSettings['type']) => void;
  onChangeStrategy?: (strategyId: AutoCoverStrategyId) => void;
};

const CoverTypeSelector = ({ type, autoStrategy, onChangeType, onChangeStrategy }: Props) => {
  return (
    <div className="cover-type-selector mb-6">
      <label className="mb-2 block text-sm font-semibold text-neutral-300">Cover Mode</label>
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-800 bg-neutral-900/70 p-1.5">
        <button
          type="button"
          onClick={() => onChangeType('auto')}
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all duration-200 ${
            type === 'auto'
              ? 'bg-neutral-800 text-white shadow-md'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <span className="material-icons-round text-base">auto_awesome</span>
          Automatic Cover
        </button>
        <button
          type="button"
          onClick={() => onChangeType('collage')}
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all duration-200 ${
            type === 'collage'
              ? 'bg-neutral-800 text-white shadow-md'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <span className="material-icons-round text-base">grid_view</span>
          Custom Song Collage
        </button>
      </div>

      {type === 'auto' && onChangeStrategy && (
        <div className="mt-3">
          <label className="mb-1.5 block text-xs font-semibold text-neutral-400">
            Auto Selection Strategy
          </label>
          <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/60 p-1">
            {getAllAutoCoverStrategies().map((strat) => {
              const active = (autoStrategy || 'firstN') === strat.id;
              return (
                <button
                  key={strat.id}
                  type="button"
                  title={strat.description}
                  onClick={() => onChangeStrategy(strat.id)}
                  className={`cursor-pointer rounded-md py-1 text-xs font-semibold transition-all duration-200 ${
                    active
                      ? 'bg-neutral-800 text-white shadow-sm ring-1 ring-neutral-700'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {strat.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CoverTypeSelector;
