import type { CoverRendererProps } from '../../../types/playlistCover';
import DefaultImgCover from '../../../assets/images/webp/song_cover_default.webp';
import Img from '../../Img';

const GridRenderer = ({ artworks = [], layout }: CoverRendererProps) => {
  const count = artworks.length;

  if (count === 0) {
    return (
      <div className="relative overflow-hidden rounded-lg shadow-md aspect-square h-full w-full">
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
      <div className="relative overflow-hidden rounded-lg shadow-md aspect-square h-full w-full">
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
      <div className="relative grid grid-cols-2 gap-0.5 overflow-hidden rounded-lg shadow-md aspect-square h-full w-full">
        <Img
          src={artworks[0] || DefaultImgCover}
          fallbackSrc={DefaultImgCover}
          alt="Cover 1"
          className="h-full w-full object-cover"
        />
        <Img
          src={artworks[1] || DefaultImgCover}
          fallbackSrc={DefaultImgCover}
          alt="Cover 2"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="relative grid grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-lg shadow-md aspect-square h-full w-full">
        <div className="row-span-2">
          <Img
            src={artworks[0] || DefaultImgCover}
            fallbackSrc={DefaultImgCover}
            alt="Cover 1"
            className="h-full w-full object-cover"
          />
        </div>
        <div>
          <Img
            src={artworks[1] || DefaultImgCover}
            fallbackSrc={DefaultImgCover}
            alt="Cover 2"
            className="h-full w-full object-cover"
          />
        </div>
        <div>
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

  // 4 Quadrants Grid
  return (
    <div className="relative grid grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-lg shadow-md aspect-square h-full w-full">
      {artworks.slice(0, 4).map((art, index) => (
        <Img
          key={index}
          src={art || DefaultImgCover}
          fallbackSrc={DefaultImgCover}
          alt={`Cover ${index + 1}`}
          className="h-full w-full object-cover"
        />
      ))}
    </div>
  );
};

export default GridRenderer;
