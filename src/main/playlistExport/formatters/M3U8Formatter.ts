import { M3UFormatter } from './M3UFormatter';

export class M3U8Formatter extends M3UFormatter {
  // M3U8 uses the exact same format as M3U but is explicitly UTF-8 encoded.
  // The ExportService will handle saving the file with UTF-8 encoding.
}
