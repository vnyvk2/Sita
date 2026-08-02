import { getAvailableVariants } from '../../constants/variantRegistry';
import type { CoverLayoutVariant, PlaylistCoverLayout } from '../../types/playlistCover';

interface Props {
  layout: PlaylistCoverLayout;
  selectedVariant?: CoverLayoutVariant;
  onChange: (variant: CoverLayoutVariant) => void;
}

const VariantSelector = ({ layout, selectedVariant, onChange }: Props) => {
  const availableVariants = getAvailableVariants(layout);

  if (availableVariants.length === 0) return null;

  const activeVariant = selectedVariant || availableVariants[0].id;

  return (
    <div className="mb-4">
      <label className="mb-2 block text-sm font-semibold text-neutral-300">Layout Sub-Style</label>
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-neutral-900/70 p-1.5 border border-neutral-800">
        {availableVariants.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(v.id)}
            title={v.description}
            className={`flex items-center justify-center rounded-lg py-2 text-sm font-semibold transition-all duration-150 ease-out cursor-pointer hover:scale-[1.02] ${
              activeVariant === v.id
                ? 'bg-neutral-800 text-white shadow-md ring-1 ring-neutral-700'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default VariantSelector;
