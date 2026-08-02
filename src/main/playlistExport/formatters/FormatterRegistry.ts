import type { PlaylistExportFormat } from '../../../common/collections/types';
import type { PlaylistFormatter } from './PlaylistFormatter';
import { M3UFormatter } from './M3UFormatter';
import { M3U8Formatter } from './M3U8Formatter';

export class FormatterRegistry {
  private formatters = new Map<PlaylistExportFormat, PlaylistFormatter>();

  constructor() {
    this.register('m3u', new M3UFormatter());
    this.register('m3u8', new M3U8Formatter());
  }

  register(format: PlaylistExportFormat, formatter: PlaylistFormatter): void {
    this.formatters.set(format, formatter);
  }

  get(format: PlaylistExportFormat): PlaylistFormatter {
    const formatter = this.formatters.get(format);
    if (!formatter) {
      // Fallback to default M3U8 formatter if unsupported
      return this.formatters.get('m3u8') ?? new M3U8Formatter();
    }
    return formatter;
  }
}

export const defaultFormatterRegistry = new FormatterRegistry();
