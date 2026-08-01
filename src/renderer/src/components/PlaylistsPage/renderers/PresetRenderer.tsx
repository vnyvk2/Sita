import type { ClipPathArtworkCount, CoverRendererProps, LayoutPreset } from '../../../types/playlistCover';
import ClipPathRenderer from './ClipPathRenderer';
import CoverImageTile from './CoverImageTile';

interface PresetRendererProps<S extends string> extends CoverRendererProps {
  presets: LayoutPreset<S>;
  defaultStyle: S;
}

function PresetRenderer<S extends string>({
  artworks = [],
  requestedCount,
  style,
  className = '',
  enableImgFadeIns = true,
  presets,
  defaultStyle
}: PresetRendererProps<S>) {
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
        <CoverImageTile src={artworks[0]} enableImgFadeIns={enableImgFadeIns} alt="Cover 1" />
      </div>
    );
  }

  const targetStyle = style && style in presets ? (style as S) : defaultStyle;
  const stylePresets = presets[targetStyle];
  const clipPaths = stylePresets[(count as ClipPathArtworkCount)] || stylePresets[4];

  return (
    <ClipPathRenderer
      artworks={artworks}
      clipPaths={clipPaths}
      className={className}
      enableImgFadeIns={enableImgFadeIns}
    />
  );
}

export default PresetRenderer;
