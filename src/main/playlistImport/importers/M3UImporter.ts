import { basename, extname } from 'path';
import type { PlaylistImporter } from '../interfaces/PlaylistImporter';
import type { PlaylistImportContext } from '../interfaces/PlaylistImportContext';
import type { PlaylistImportResult } from '../models/PlaylistImportResult';
import type { ImportedPlaylistEntry } from '../models/ImportedPlaylistEntry';
import type { ImportedTrackReference } from '../models/ImportedTrackReference';
import type { PlaylistImportWarning } from '../models/PlaylistImportWarning';
import type { PlaylistFormat } from '../constants/PlaylistFormats';
import { InvalidPlaylistError } from '../errors/PlaylistImportError';
import logger from '../../logger';

interface PendingExtInf {
  duration?: number;
  artist?: string;
  title?: string;
}

export class M3UImporter implements PlaylistImporter {
  readonly id = 'm3u-importer';
  readonly name = 'M3U / M3U8 Importer';
  readonly supportedExtensions: readonly string[] = ['.m3u', '.m3u8'];
  readonly supportedMimeTypes: readonly string[] = [
    'audio/x-mpegurl',
    'audio/mpegurl',
    'application/vnd.apple.mpegurl'
  ];

  async parse(context: PlaylistImportContext): Promise<PlaylistImportResult> {
    const { filePath, content: rawContent } = context;

    let content = rawContent;
    // Strip UTF-8 Byte Order Mark (BOM) if present
    if (content.startsWith('\uFEFF')) {
      content = content.slice(1);
    }

    const lines = content.split(/\r?\n/);
    if (lines.length === 0 || (lines.length === 1 && lines[0].trim().length === 0)) {
      throw new InvalidPlaylistError(filePath, 'File is empty');
    }

    const entries: ImportedPlaylistEntry[] = [];
    const warnings: PlaylistImportWarning[] = [];
    let pendingMetadata: PendingExtInf | null = null;
    let position = 1;

    for (let index = 0; index < lines.length; index++) {
      const lineNum = index + 1;
      const rawLine = lines[index];
      const line = rawLine.trim();

      if (line.length === 0) {
        continue;
      }

      if (line.startsWith('#')) {
        const upperLine = line.toUpperCase();
        if (upperLine.startsWith('#EXTINF:')) {
          const parsed = this.parseExtInf(line, lineNum, warnings);
          if (parsed) {
            pendingMetadata = parsed;
          }
        } else if (upperLine.startsWith('#EXTM3U')) {
          // Standard header directive
        } else if (upperLine.startsWith('#EXT')) {
          // Unknown #EXT directive
          const spaceOrColon = line.search(/[:\s]/);
          const directive = spaceOrColon !== -1 ? line.substring(0, spaceOrColon) : line;
          warnings.push({
            code: 'UNKNOWN_DIRECTIVE',
            message: `Unknown directive: ${directive}`,
            lineNumber: lineNum
          });
        }
        // Standard non-directive comments (#...) are ignored
        continue;
      }

      // Path / URI entry line
      const track: ImportedTrackReference = {
        originalLocation: line,
        title: pendingMetadata?.title,
        artist: pendingMetadata?.artist,
        duration: pendingMetadata?.duration
      };

      entries.push({
        position: position++,
        sourceLine: lineNum,
        track
      });

      logger.info({
        stage: 'PARSED',
        path: line
      });

      pendingMetadata = null;
    }

    const ext = extname(filePath).toLowerCase();
    const format: PlaylistFormat = ext === '.m3u8' ? 'm3u8' : 'm3u';
    const playlistName = basename(filePath, extname(filePath));

    return {
      playlist: {
        name: playlistName,
        entries,
        sourceFormat: format,
        sourceFile: filePath,
        createdByImporter: this.id
      },
      warnings,
      importerId: this.id,
      format
    };
  }

  private parseExtInf(line: string, lineNum: number, warnings: PlaylistImportWarning[]): PendingExtInf | null {
    const metadata: PendingExtInf = {};
    const content = line.substring(8).trim(); // Remove #EXTINF:
    const commaIndex = content.indexOf(',');

    if (commaIndex === -1) {
      warnings.push({
        code: 'MALFORMED_EXTINF',
        message: `Malformed #EXTINF directive at line ${lineNum}: missing title/artist payload separator`,
        lineNumber: lineNum
      });
      return null;
    }

    const durationStr = content.substring(0, commaIndex).trim();
    const parsedDuration = parseInt(durationStr, 10);
    if (!isNaN(parsedDuration) && parsedDuration >= 0) {
      metadata.duration = parsedDuration;
    }

    const info = content.substring(commaIndex + 1).trim();
    const dashIndex = info.indexOf(' - ');

    if (dashIndex !== -1) {
      metadata.artist = info.substring(0, dashIndex).trim();
      metadata.title = info.substring(dashIndex + 3).trim();
    } else if (info.length > 0) {
      metadata.title = info;
    }

    return metadata;
  }
}
