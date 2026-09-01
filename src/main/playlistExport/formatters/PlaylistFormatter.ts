export interface ExportEntry {
  title?: string;
  artist?: string;
  duration?: number;
  resolvedPath: string;
}

export interface FormatterOptions {
  includeExtInf?: boolean;
}

export interface PlaylistFormatter {
  format(entries: ExportEntry[], options?: FormatterOptions): string;
}
