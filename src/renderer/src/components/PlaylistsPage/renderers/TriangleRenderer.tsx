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
        {/* Top-Left Diagonal */}
        <CoverImageTile
          src={artworks[0]}
          enableImgFadeIns={enableImgFadeIns}
          alt="Cover 1"
          className="absolute inset-0"
          clipPath="polygon(0 0, 100% 0, 0 100%)"
        />
        {/* Bottom-Right Diagonal */}
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
          clipPath="polygon(0 0, 100% 0, 50% 60%)"
        />
        {/* Bottom Left Triangle */}
        <CoverImageTile
          src={artworks[1]}
          enableImgFadeIns={enableImgFadeIns}
          alt="Cover 2"
          className="absolute inset-0"
          clipPath="polygon(0 0, 50% 60%, 0 100%)"
        />
        {/* Bottom Right Triangle */}
        <CoverImageTile
          src={artworks[2]}
          enableImgFadeIns={enableImgFadeIns}
          alt="Cover 3"
          className="absolute inset-0"
          clipPath="polygon(100% 0, 100% 100%, 50% 60%)"
        />
      </div>
    );
  }

  // 4 Artworks Balanced Triangular Geometric Composition
  return (
    <div className={containerClass}>
      {/* Top-Left Region */}
      <CoverImageTile
        src={artworks[0]}
        enableImgFadeIns={enableImgFadeIns}
        alt="Cover 1"
        className="absolute inset-0"
        clipPath="polygon(0 0, 100% 0, 0 100%)"
      />
      {/* Bottom-Right Region */}
      <CoverImageTile
        src={artworks[1]}
        enableImgFadeIns={enableImgFadeIns}
        alt="Cover 2"
        className="absolute inset-0"
        clipPath="polygon(100% 0, 100% 100%, 0 100%)"
      />
      {/* Center Top Triangle Overlay */}
      <CoverImageTile
        src={artworks[2]}
        enableImgFadeIns={enableImgFadeIns}
        alt="Cover 3"
        className="absolute inset-0"
        clipPath="polygon(25% 25%, 75% 25%, 50% 75%)"
      />
      {/* Bottom Left Corner Triangle Overlay */}
      <CoverImageTile
        src={artworks[3]}
        enableImgFadeIns={enableImgFadeIns}
        alt="Cover 4"
        className="absolute inset-0"
        clipPath="polygon(0 50%, 50% 100%, 0 100%)"
      />
    </div>
  );
};

export default TriangleRenderer;
