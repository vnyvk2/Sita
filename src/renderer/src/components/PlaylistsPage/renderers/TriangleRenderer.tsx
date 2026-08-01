import type { CoverRendererProps } from '../../../types/playlistCover';
import CoverImageTile from './CoverImageTile';

const TriangleRenderer = ({
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
      <div className={containerClass}>
        {/* Top-Left Diagonal Triangle */}
        <CoverImageTile
          src={artworks[0]}
          enableImgFadeIns={enableImgFadeIns}
          alt="Cover 1"
          className="absolute inset-0"
          clipPath="polygon(0 0, 100% 0, 0 100%)"
        />
        {/* Bottom-Right Diagonal Triangle */}
        <CoverImageTile
          src={artworks[1]}
          enableImgFadeIns={enableImgFadeIns}
          alt="Cover 2"
          className="absolute inset-0"
          clipPath="polygon(100% 0, 100% 100%, 0 100%)"
        />
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className={containerClass}>
        {/* Top Triangle */}
        <CoverImageTile
          src={artworks[0]}
          enableImgFadeIns={enableImgFadeIns}
          alt="Cover 1"
          className="absolute inset-0"
          clipPath="polygon(0 0, 100% 0, 50% 50%)"
        />
        {/* Left Triangle */}
        <CoverImageTile
          src={artworks[1]}
          enableImgFadeIns={enableImgFadeIns}
          alt="Cover 2"
          className="absolute inset-0"
          clipPath="polygon(0 0, 50% 50%, 0 100%)"
        />
        {/* Bottom-Right Quad */}
        <CoverImageTile
          src={artworks[2]}
          enableImgFadeIns={enableImgFadeIns}
          alt="Cover 3"
          className="absolute inset-0"
          clipPath="polygon(100% 0, 100% 100%, 0 100%, 50% 50%)"
        />
      </div>
    );
  }

  // 4 Artworks 100% Coverage 4-Triangle Pinwheel Layout
  return (
    <div className={containerClass}>
      {/* Top Triangle */}
      <CoverImageTile
        src={artworks[0]}
        enableImgFadeIns={enableImgFadeIns}
        alt="Cover 1"
        className="absolute inset-0"
        clipPath="polygon(0 0, 100% 0, 50% 50%)"
      />
      {/* Right Triangle */}
      <CoverImageTile
        src={artworks[1]}
        enableImgFadeIns={enableImgFadeIns}
        alt="Cover 2"
        className="absolute inset-0"
        clipPath="polygon(100% 0, 100% 100%, 50% 50%)"
      />
      {/* Bottom Triangle */}
      <CoverImageTile
        src={artworks[2]}
        enableImgFadeIns={enableImgFadeIns}
        alt="Cover 3"
        className="absolute inset-0"
        clipPath="polygon(0 100%, 100% 100%, 50% 50%)"
      />
      {/* Left Triangle */}
      <CoverImageTile
        src={artworks[3]}
        enableImgFadeIns={enableImgFadeIns}
        alt="Cover 4"
        className="absolute inset-0"
        clipPath="polygon(0 0, 0 100%, 50% 50%)"
      />
    </div>
  );
};

export default TriangleRenderer;
