export class PlaylistImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaylistImportError';
  }
}

export class UnsupportedFormatError extends PlaylistImportError {
  filePath: string;
  constructor(filePath: string) {
    super(`Unsupported playlist format for file: ${filePath}`);
    this.name = 'UnsupportedFormatError';
    this.filePath = filePath;
  }
}

export class InvalidPlaylistError extends PlaylistImportError {
  filePath: string;
  constructor(filePath: string, reason?: string) {
    super(`Invalid playlist file: ${filePath}${reason ? ` (${reason})` : ''}`);
    this.name = 'InvalidPlaylistError';
    this.filePath = filePath;
  }
}

export class CorruptedPlaylistError extends PlaylistImportError {
  filePath: string;
  constructor(filePath: string) {
    super(`Corrupted playlist file: ${filePath}`);
    this.name = 'CorruptedPlaylistError';
    this.filePath = filePath;
  }
}
