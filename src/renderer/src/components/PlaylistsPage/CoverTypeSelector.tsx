import type { PlaylistCoverSettings } from '../../types/playlistCover';

type Props = {
  type: PlaylistCoverSettings['type'];
  onChange: (type: PlaylistCoverSettings['type']) => void;
};

const CoverTypeSelector = ({ type, onChange }: Props) => {
  return (
    <div className="cover-type-selector mb-6">
      <label className="mb-2 block text-sm font-semibold text-neutral-300">Cover Mode</label>
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-neutral-900/70 p-1.5 border border-neutral-800">
        <button
          type="button"
          onClick={() => onChange('auto')}
          className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all duration-200 cursor-pointer ${
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
          onClick={() => onChange('collage')}
          className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all duration-200 cursor-pointer ${
            type === 'collage'
              ? 'bg-neutral-800 text-white shadow-md'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <span className="material-icons-round text-base">grid_view</span>
          Custom Song Collage
        </button>
      </div>
    </div>
  );
};

export default CoverTypeSelector;
