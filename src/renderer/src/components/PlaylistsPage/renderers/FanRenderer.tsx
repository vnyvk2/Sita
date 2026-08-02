import { FAN_PRESETS } from '../../../constants/fanPresets';
import type { CoverRendererProps } from '../../../types/playlistCover';
import PresetRenderer from './PresetRenderer';

const FanRenderer = (props: CoverRendererProps) => {
  return <PresetRenderer {...props} presets={FAN_PRESETS} defaultStyle="standard" />;
};

export default FanRenderer;
