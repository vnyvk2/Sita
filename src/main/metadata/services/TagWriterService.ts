import { ByteVector, Picture, PictureType } from 'node-taglib-sharp';
import sharp from 'sharp';
import { withFileHandle } from '../../utils/withFileHandle';

export interface TagWritePayload {
  filePath: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  genre?: string;
  isrc?: string;
  musicBrainzRecordingId?: string;
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

      await withFileHandle(payload.filePath, async (file) => {
        if (payload.title) file.tag.title = payload.title;
        if (payload.artist) file.tag.performers = [payload.artist];
        if (payload.album) file.tag.album = payload.album;
        if (payload.genre) file.tag.genres = [payload.genre];
        if (payload.trackNumber !== undefined) file.tag.track = payload.trackNumber;
        if (payload.year !== undefined) file.tag.year = payload.year;

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
