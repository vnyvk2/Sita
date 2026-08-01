import type { CoverRendererProps, TriangleStyle } from '../../../types/playlistCover';
import ClipPathRenderer from './ClipPathRenderer';
import CoverImageTile from './CoverImageTile';

type ArtworkCount = 2 | 3 | 4;

const DIAGONAL_PRESETS: Record<ArtworkCount, readonly string[]> = {
  2: [
    'polygon(0 0, 100% 0, 0 100%)',
    'polygon(100% 0, 100% 100%, 0 100%)'
  ],
  3: [
    'polygon(0 0, 100% 0, 50% 50%)',
    'polygon(0 0, 50% 50%, 0 100%)',
    'polygon(100% 0, 100% 100%, 0 100%, 50% 50%)'
  ],
  4: [
    'polygon(0 0, 100% 0, 50% 50%)',
    'polygon(100% 0, 100% 100%, 50% 50%)',
    'polygon(0 100%, 100% 100%, 50% 50%)',
    'polygon(0 0, 0 100%, 50% 50%)'
  ]
} as const;

const TRIANGLE_PRESETS: Record<TriangleStyle, Record<ArtworkCount, readonly string[]>> = {
  diagonal: DIAGONAL_PRESETS,
  pinwheel: DIAGONAL_PRESETS,
  center: DIAGONAL_PRESETS
};

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

  const targetStyle = style && style in TRIANGLE_PRESETS ? style : 'diagonal';
  const stylePresets = TRIANGLE_PRESETS[targetStyle];
  const clipPaths = stylePresets[(count as ArtworkCount)] || stylePresets[4];

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
