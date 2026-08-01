import type { ResolvedPlaylistCover } from '../../types/playlistCover';
import MultipleArtworksCover from './MultipleArtworksCover';

type Props = {
  resolvedCover: ResolvedPlaylistCover;
  requestedCount?: number;
};

const CoverLivePreview = ({ resolvedCover, requestedCount }: Props) => {
  return (
    <div className="cover-live-preview mb-6 flex flex-col items-center">
      <label className="mb-2 w-full text-left text-sm font-semibold text-neutral-300">Live Preview</label>
      <div className="relative h-44 w-44 overflow-hidden rounded-2xl border-2 border-neutral-700/60 shadow-xl bg-neutral-900 transition-opacity duration-300 ease-out">
        <MultipleArtworksCover
          resolvedArtworks={resolvedCover.artworks}
          layout={resolvedCover.layout}
          requestedCount={requestedCount}
          className="h-full w-full transition-opacity duration-300 ease-out"
        />
      </div>
    </div>
  );
};

export default CoverLivePreview;
