import { TRIANGLE_PRESETS } from '../../../constants/trianglePresets';
import type { ClipPathArtworkCount, CoverRendererProps, TriangleStyle } from '../../../types/playlistCover';
import ClipPathRenderer from './ClipPathRenderer';
import CoverImageTile from './CoverImageTile';

const TriangleRenderer = ({
  artworks = [],
  style,
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

  const targetStyle: TriangleStyle = style && style in TRIANGLE_PRESETS ? (style as TriangleStyle) : 'diagonal';
  const stylePresets = TRIANGLE_PRESETS[targetStyle];
  const clipPaths = stylePresets[(count as ClipPathArtworkCount)] || stylePresets[4];

  return (
    <ClipPathRenderer
      artworks={artworks}
      clipPaths={clipPaths}
      className={className}
      enableImgFadeIns={enableImgFadeIns}
    />
  );
};

export default TriangleRenderer;
