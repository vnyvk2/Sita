import { M3UImporter } from '@main/playlistImport/importers/M3UImporter';
import { describe, it, expect, beforeEach } from 'vitest';

describe('M3UImporter', () => {
  let importer: M3UImporter;

  beforeEach(() => {
    importer = new M3UImporter();
  });

  it('should declare supported extensions', () => {
    expect(importer.supportedExtensions).toContain('.m3u');
    expect(importer.supportedExtensions).toContain('.m3u8');
  });

  it('should parse standard M3U lines preserving position, sourceLine, and originalLocation', async () => {
    const content = `
song1.mp3
song2.flac
folder/song3.ogg
`;

    const result = await importer.parse({ filePath: '/music/MyPlaylist.m3u', content });

    expect(result.format).toBe('m3u');
    expect(result.playlist.name).toBe('MyPlaylist');
    expect(result.playlist.entries).toHaveLength(3);
    expect(result.playlist.entries[0]).toEqual({
      position: 1,
      sourceLine: 2,
      track: {
        originalLocation: 'song1.mp3',
        title: undefined,
        artist: undefined,
        duration: undefined
      }
    });
    expect(result.playlist.entries[2]).toEqual({
      position: 3,
      sourceLine: 4,
      track: {
        originalLocation: 'folder/song3.ogg',
        title: undefined,
        artist: undefined,
        duration: undefined
      }
    });
  });

  it('should parse extended M3U with #EXTINF directives', async () => {
    const content = String.raw`#EXTM3U
#EXTINF:245,The Beatles - Hey Jude
..\Music\HeyJude.mp3

#EXTINF:180,Standalone Title
Track2.flac
`;

    const result = await importer.parse({
      filePath: '/music/Rock.m3u8',
      content: '\uFEFF' + content
    });

    expect(result.format).toBe('m3u8');
    expect(result.playlist.entries).toHaveLength(2);
    expect(result.playlist.entries[0]).toEqual({
      position: 1,
      sourceLine: 3,
      track: {
        originalLocation: String.raw`..\Music\HeyJude.mp3`,
        artist: 'The Beatles',
        title: 'Hey Jude',
        duration: 245
      }
    });
    expect(result.playlist.entries[1]).toEqual({
      position: 2,
      sourceLine: 6,
      track: {
        originalLocation: 'Track2.flac',
        artist: undefined,
        title: 'Standalone Title',
        duration: 180
      }
    });
  });

  it('should record warnings with lineNumber for unknown #EXT directives and malformed #EXTINF', async () => {
    const content = `
#EXTM3U
#EXTSOMEUNKNOWN
#EXTINF:badformat
song.mp3
`;

    const result = await importer.parse({ filePath: '/music/Test.m3u', content });
    expect(result.playlist.entries).toHaveLength(1);
    expect(result.playlist.entries[0].track.originalLocation).toBe('song.mp3');
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toEqual({
      code: 'UNKNOWN_DIRECTIVE',
      message: 'Unknown directive: #EXTSOMEUNKNOWN',
      lineNumber: 3
    });
    expect(result.warnings[1]).toEqual({
      code: 'MALFORMED_EXTINF',
      message: 'Malformed #EXTINF directive at line 4: missing title/artist payload separator',
      lineNumber: 4
    });
  });
});
