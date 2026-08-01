import { FAN_PRESETS, type FanStyle } from '../../../constants/fanPresets';
import type { ClipPathArtworkCount, CoverRendererProps } from '../../../types/playlistCover';
import ClipPathRenderer from './ClipPathRenderer';
import CoverImageTile from './CoverImageTile';

const FanRenderer = ({
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

  const targetStyle: FanStyle = style && style in FAN_PRESETS ? (style as FanStyle) : 'standard';
  const stylePresets = FAN_PRESETS[targetStyle];
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

export default FanRenderer;
