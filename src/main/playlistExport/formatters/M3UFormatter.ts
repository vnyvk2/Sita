import type { PlaylistFormatter, ExportEntry, FormatterOptions } from './PlaylistFormatter';

export class M3UFormatter implements PlaylistFormatter {
  format(entries: ExportEntry[], options?: FormatterOptions): string {
    const includeExtInf = options?.includeExtInf ?? true;
    const lines: string[] = [];

    if (includeExtInf) {
      lines.push('#EXTM3U');
    }

    for (const entry of entries) {
      if (includeExtInf) {
        const titleStr =
          entry.artist && entry.title
            ? `${entry.artist} - ${entry.title}`
            : entry.title || 'Unknown Track';
        const duration = entry.duration ? Math.round(entry.duration) : -1;

        lines.push(`#EXTINF:${duration},${titleStr}`);
      }
      lines.push(entry.resolvedPath);
    }

    return lines.join('\n') + '\n';
  }
}
