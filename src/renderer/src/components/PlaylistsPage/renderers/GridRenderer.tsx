import DefaultImgCover from '../../../assets/images/webp/song_cover_default.webp';
import type { CoverRendererProps } from '../../../types/playlistCover';
import CoverImageTile from './CoverImageTile';

const GridRenderer = ({
  artworks = [],
  className = '',
  enableImgFadeIns = true,
  requestedCount
}: CoverRendererProps) => {
  const count = requestedCount ?? artworks.length;
  const containerClass = `relative overflow-hidden aspect-square h-full w-full bg-neutral-900 ${className}`;

  if (count === 0) {
    return (
      <div className={containerClass}>
        <CoverImageTile enableImgFadeIns={enableImgFadeIns} />
      </div>
    );
  }

  if (count === 1) {
    return (
      <div className={containerClass}>
        <CoverImageTile src={artworks[0] ?? DefaultImgCover} enableImgFadeIns={enableImgFadeIns} alt="Cover 1" />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className={`grid grid-cols-2 gap-0.5 ${containerClass}`}>
        <CoverImageTile src={artworks[0] ?? DefaultImgCover} enableImgFadeIns={enableImgFadeIns} alt="Cover 1" />
        <CoverImageTile src={artworks[1] ?? DefaultImgCover} enableImgFadeIns={enableImgFadeIns} alt="Cover 2" />
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 gap-0.5 ${containerClass}`}>
        <div className="row-span-2 h-full w-full">
          <CoverImageTile src={artworks[0] ?? DefaultImgCover} enableImgFadeIns={enableImgFadeIns} alt="Cover 1" />
        </div>
        <CoverImageTile src={artworks[1] ?? DefaultImgCover} enableImgFadeIns={enableImgFadeIns} alt="Cover 2" />
        <CoverImageTile src={artworks[2] ?? DefaultImgCover} enableImgFadeIns={enableImgFadeIns} alt="Cover 3" />
      </div>
    );
  }

  // 4 Quadrants Grid
  return (
    <div className={`grid grid-cols-2 grid-rows-2 gap-0.5 ${containerClass}`}>
      {Array.from({ length: 4 }).map((_, index) => (
        <CoverImageTile
          key={index}
          src={artworks[index] ?? DefaultImgCover}
          enableImgFadeIns={enableImgFadeIns}
          alt={`Cover ${index + 1}`}
        />
      ))}
    </div>
  );
};

export default GridRenderer;
