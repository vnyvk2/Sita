import { TRIANGLE_PRESETS } from '../../../constants/trianglePresets';
import type { CoverRendererProps } from '../../../types/playlistCover';
import PresetRenderer from './PresetRenderer';

const TriangleRenderer = (props: CoverRendererProps) => {
  return <PresetRenderer {...props} presets={TRIANGLE_PRESETS} defaultStyle="diagonal" />;
};

export default TriangleRenderer;
