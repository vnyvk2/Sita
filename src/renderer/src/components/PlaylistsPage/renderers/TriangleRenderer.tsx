import type { CoverRendererProps } from '../../../types/playlistCover';
import DefaultImgCover from '../../../assets/images/webp/song_cover_default.webp';
import Img from '../../Img';

const TriangleRenderer = ({ artworks = [] }: CoverRendererProps) => {
  const count = artworks.length;

  if (count === 0) {
    return (
      <div className="relative overflow-hidden rounded-lg shadow-md aspect-square h-full w-full bg-neutral-900">
        <Img
          src={DefaultImgCover}
          alt="Default Cover"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  if (count === 1) {
    return (
      <div className="relative overflow-hidden rounded-lg shadow-md aspect-square h-full w-full bg-neutral-900">
        <Img
          src={artworks[0] || DefaultImgCover}
          fallbackSrc={DefaultImgCover}
          alt="Playlist Cover"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="relative overflow-hidden rounded-lg shadow-md aspect-square h-full w-full bg-neutral-900">
        {/* Top-Left Diagonal Triangle */}
        <div
          className="absolute inset-0 h-full w-full overflow-hidden"
          style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
        >
          <Img
            src={artworks[0] || DefaultImgCover}
            fallbackSrc={DefaultImgCover}
            alt="Cover 1"
            className="h-full w-full object-cover"
          />
        </div>
        {/* Bottom-Right Diagonal Triangle */}
        <div
          className="absolute inset-0 h-full w-full overflow-hidden"
          style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
        >
          <Img
            src={artworks[1] || DefaultImgCover}
            fallbackSrc={DefaultImgCover}
            alt="Cover 2"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="relative overflow-hidden rounded-lg shadow-md aspect-square h-full w-full bg-neutral-900">
        {/* Top Centered Triangle */}
        <div
          className="absolute inset-0 h-full w-full overflow-hidden"
          style={{ clipPath: 'polygon(0 0, 100% 0, 50% 60%)' }}
        >
          <Img
            src={artworks[0] || DefaultImgCover}
            fallbackSrc={DefaultImgCover}
            alt="Cover 1"
            className="h-full w-full object-cover"
          />
        </div>
        {/* Bottom-Left Triangle */}
        <div
          className="absolute inset-0 h-full w-full overflow-hidden"
          style={{ clipPath: 'polygon(0 0, 50% 60%, 0 100%)' }}
        >
          <Img
            src={artworks[1] || DefaultImgCover}
            fallbackSrc={DefaultImgCover}
            alt="Cover 2"
            className="h-full w-full object-cover"
          />
        </div>
        {/* Bottom-Right Triangle */}
        <div
          className="absolute inset-0 h-full w-full overflow-hidden"
          style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
        >
          <Img
            src={artworks[2] || DefaultImgCover}
            fallbackSrc={DefaultImgCover}
            alt="Cover 3"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    );
  }

  // 4 Artworks Geometric Composition
  return (
    <div className="relative overflow-hidden rounded-lg shadow-md aspect-square h-full w-full bg-neutral-900">
      {/* Quadrant Top-Left Diagonal */}
      <div
        className="absolute inset-0 h-full w-full overflow-hidden"
        style={{ clipPath: 'polygon(0 0, 50% 0, 0 50%)' }}
      >
        <Img
          src={artworks[0] || DefaultImgCover}
          fallbackSrc={DefaultImgCover}
          alt="Cover 1"
          className="h-full w-full object-cover"
        />
      </div>
      {/* Quadrant Top-Right Triangle */}
      <div
        className="absolute inset-0 h-full w-full overflow-hidden"
        style={{ clipPath: 'polygon(50% 0, 100% 0, 100% 50%, 50% 50%)' }}
      >
        <Img
          src={artworks[1] || DefaultImgCover}
          fallbackSrc={DefaultImgCover}
          alt="Cover 2"
          className="h-full w-full object-cover"
        />
      </div>
      {/* Quadrant Bottom-Left Triangle */}
      <div
        className="absolute inset-0 h-full w-full overflow-hidden"
        style={{ clipPath: 'polygon(0 50%, 50% 50%, 50% 100%, 0 100%)' }}
      >
        <Img
          src={artworks[2] || DefaultImgCover}
          fallbackSrc={DefaultImgCover}
          alt="Cover 3"
          className="h-full w-full object-cover"
        />
      </div>
      {/* Quadrant Bottom-Right Diagonal Triangle */}
      <div
        className="absolute inset-0 h-full w-full overflow-hidden"
        style={{ clipPath: 'polygon(50% 50%, 100% 50%, 100% 100%)' }}
      >
        <Img
          src={artworks[3] || DefaultImgCover}
          fallbackSrc={DefaultImgCover}
          alt="Cover 4"
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  );
};

export default TriangleRenderer;
