import type {
  CoverLayoutVariant,
  CoverRendererProps,
  PlaylistCoverLayout
} from '../../types/playlistCover';
import DiamondRenderer from './renderers/DiamondRenderer';
import FanRenderer from './renderers/FanRenderer';
import GridRenderer from './renderers/GridRenderer';
import TriangleRenderer from './renderers/TriangleRenderer';

type Props = {
  className?: string;
  imgClassName?: string;
  holderClassName?: string;
  enableImgFadeIns?: boolean;
  resolvedArtworks?: string[];
  layout?: PlaylistCoverLayout;
  variant?: CoverLayoutVariant;
  requestedCount?: number;
};

const COVER_RENDERERS: Record<PlaylistCoverLayout, React.ComponentType<CoverRendererProps>> = {
  grid: GridRenderer,
  triangle: TriangleRenderer,
  fan: FanRenderer,
  diamond: DiamondRenderer
};

const MultipleArtworksCover = (props: Props) => {
  const {
    className = '',
    imgClassName = '',
    enableImgFadeIns = true,
    resolvedArtworks = [],
    layout = 'grid',
    variant,
    requestedCount
  } = props;

  const Renderer = COVER_RENDERERS[layout] || GridRenderer;

  return (
    <div className={`relative aspect-square overflow-hidden rounded-lg shadow-md ${className}`}>
      <Renderer
        artworks={resolvedArtworks}
        layout={layout}
        variant={variant}
        requestedCount={requestedCount}
        className={imgClassName}
        enableImgFadeIns={enableImgFadeIns}
      />
    </div>
  );
};

export default MultipleArtworksCover;
