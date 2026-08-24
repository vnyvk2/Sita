import { ByteVector, Picture, PictureType } from 'node-taglib-sharp';
import sharp from 'sharp';

import { removeDefaultAppProtocolFromFilePath } from '../../fs/resolveFilePaths';
import { withFileHandle } from '../../utils/withFileHandle';

export interface TagWritePayload {
  filePath: string;
  /**
   * Field semantics:
   * - `undefined`: leave the existing tag untouched.
   * - `null` or `''`: explicitly clear the tag (required for value-complete rollback/undo).
   * - otherwise: write the given value.
   */
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumArtist?: string | null;
  year?: number | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  genre?: string | null;
  isrc?: string | null;
  language?: string | null;
  musicBrainzRecordingId?: string | null;
  artworkBuffer?: Buffer;
}

export interface TagWriteResult {
  filePath: string;
  success: boolean;
  error?: string;
}

export class TagWriterService {
  /**
   * Writes physical audio tags to disk for a file.
   */
  public async writeTags(payload: TagWritePayload): Promise<TagWriteResult> {
    try {
      if (!payload.filePath) {
        return { filePath: payload.filePath, success: false, error: 'Empty file path' };
      }

      const realPath = removeDefaultAppProtocolFromFilePath(payload.filePath);

      await withFileHandle(realPath, async (file) => {
        if (payload.title !== undefined) file.tag.title = payload.title ?? '';
        if (payload.artist !== undefined) {
          file.tag.performers = payload.artist ? [payload.artist] : [];
        }
        if (payload.albumArtist !== undefined) {
          file.tag.albumArtists = payload.albumArtist ? [payload.albumArtist] : [];
        }
        if (payload.album !== undefined) file.tag.album = payload.album ?? '';
        if (payload.genre !== undefined) {
          file.tag.genres = payload.genre ? [payload.genre] : [];
        }
        if (payload.trackNumber !== undefined) file.tag.track = payload.trackNumber ?? 0;
        if (payload.discNumber !== undefined) file.tag.disc = payload.discNumber ?? 0;
        if (payload.year !== undefined) file.tag.year = payload.year ?? 0;
        if (payload.language !== undefined) {
          if (payload.language) {
            (file.tag as any).languages = [payload.language];
          } else {
            (file.tag as any).languages = [];
          }
        }
        if (payload.musicBrainzRecordingId !== undefined) {
          if (payload.musicBrainzRecordingId) {
            if (file.tag.musicBrainzTrackId) {
              file.tag.musicBrainzTrackId = undefined;
            }
            file.tag.musicBrainzTrackId = payload.musicBrainzRecordingId;
          } else if (file.tag.musicBrainzTrackId) {
            file.tag.musicBrainzTrackId = undefined;
          }
        }
        if (payload.isrc !== undefined) {
          file.tag.isrc = payload.isrc || undefined;
        }

        if (payload.artworkBuffer && payload.artworkBuffer.length > 0) {
          try {
            const jpegBuffer = await sharp(payload.artworkBuffer)
              .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 85 })
              .toBuffer();

            if (jpegBuffer) {
              const picture = Picture.fromData(ByteVector.fromByteArray(new Uint8Array(jpegBuffer)));
              picture.mimeType = 'image/jpeg';
              picture.type = PictureType.FrontCover;
              picture.description = 'artwork';
              file.tag.pictures = [picture];
            }
          } catch (artErr: unknown) {
            console.warn(`[TagWriterService] Failed to embed artwork for ${payload.filePath}:`, artErr);
          }
        }

        file.save();
      });

      return { filePath: payload.filePath, success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { filePath: payload.filePath, success: false, error: msg };
    }
  }

  /**
   * Batch writes tags for multiple files.
   */
  public async writeBatch(payloads: TagWritePayload[]): Promise<TagWriteResult[]> {
    const results: TagWriteResult[] = [];
    for (const payload of payloads) {
      const res = await this.writeTags(payload);
      results.push(res);
    }
    return results;
  }
}
