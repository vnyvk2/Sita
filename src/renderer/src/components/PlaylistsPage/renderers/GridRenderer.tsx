import type { CoverRendererProps } from '../../../types/playlistCover';
import CoverImageTile from './CoverImageTile';

const GridRenderer = ({
  artworks = [],
  className = '',
  enableImgFadeIns = true
}: CoverRendererProps) => {
  const count = artworks.length;
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
        <CoverImageTile src={artworks[0]} enableImgFadeIns={enableImgFadeIns} alt="Cover 1" />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className={`grid grid-cols-2 gap-0.5 ${containerClass}`}>
        <CoverImageTile src={artworks[0]} enableImgFadeIns={enableImgFadeIns} alt="Cover 1" />
        <CoverImageTile src={artworks[1]} enableImgFadeIns={enableImgFadeIns} alt="Cover 2" />
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 gap-0.5 ${containerClass}`}>
        <div className="row-span-2 h-full w-full">
          <CoverImageTile src={artworks[0]} enableImgFadeIns={enableImgFadeIns} alt="Cover 1" />
        </div>
        <CoverImageTile src={artworks[1]} enableImgFadeIns={enableImgFadeIns} alt="Cover 2" />
        <CoverImageTile src={artworks[2]} enableImgFadeIns={enableImgFadeIns} alt="Cover 3" />
      </div>
    );
  }

  // 4 Quadrants Grid
  return (
    <div className={`grid grid-cols-2 grid-rows-2 gap-0.5 ${containerClass}`}>
      {artworks.slice(0, 4).map((art, index) => (
        <CoverImageTile
          key={index}
          src={art}
          enableImgFadeIns={enableImgFadeIns}
          alt={`Cover ${index + 1}`}
        />
      ))}
    </div>
  );
};

export default GridRenderer;
