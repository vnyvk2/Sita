import { DIAMOND_PRESETS } from '../../../constants/diamondPresets';
import type { CoverRendererProps } from '../../../types/playlistCover';
import PresetRenderer from './PresetRenderer';

const DiamondRenderer = (props: CoverRendererProps) => {
  return <PresetRenderer {...props} presets={DIAMOND_PRESETS} defaultStyle="classic" />;
};

export default DiamondRenderer;
