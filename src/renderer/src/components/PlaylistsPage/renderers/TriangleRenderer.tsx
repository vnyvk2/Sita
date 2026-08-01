import type { CoverRendererProps, TriangleStyle } from '../../../types/playlistCover';
import CoverImageTile from './CoverImageTile';

const TRIANGLE_PRESETS: Record<TriangleStyle, Record<number, readonly string[]>> = {
  diagonal: {
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
  },
  pinwheel: {
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
  },
  center: {
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
  }
} as const;

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

  // Gracefully resolve requested style or default to 'diagonal'
  const targetStyle: TriangleStyle =
    style && TRIANGLE_PRESETS[style as TriangleStyle] ? (style as TriangleStyle) : 'diagonal';

  const stylePresets = TRIANGLE_PRESETS[targetStyle];
  const clipPaths = stylePresets[count] || stylePresets[4];

  return (
    <div className={containerClass}>
      {artworks.slice(0, count).map((art, index) => (
        <CoverImageTile
          key={index}
          src={art}
          enableImgFadeIns={enableImgFadeIns}
          alt={`Cover ${index + 1}`}
          className="absolute inset-0"
          clipPath={clipPaths[index]}
        />
      ))}
    </div>
  );
};

export default TriangleRenderer;
