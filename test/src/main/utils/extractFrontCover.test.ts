import { extractFrontCover } from '@main/utils/extractFrontCover';
import { PictureType } from 'node-taglib-sharp';
import { describe, expect, it } from 'vitest';

describe('extractFrontCover (BUG-18 PictureType.FrontCover Filtering)', () => {
  const createMockPicture = (type: number, byteVal: number) => ({
    pictureType: type,
    data: {
      toByteArray: () => new Uint8Array([byteVal, byteVal + 1, byteVal + 2])
    }
  });

  it('selects FrontCover picture when located after other picture types', () => {
    const pictures = [
      createMockPicture(PictureType.BackCover, 10), // index 0: BackCover
      createMockPicture(PictureType.LeadArtist, 20), // index 1: Artist
      createMockPicture(PictureType.FrontCover, 30) // index 2: FrontCover
    ];

    const result = extractFrontCover(pictures);
    expect(result).toEqual(new Uint8Array([30, 31, 32]));
  });

  it('falls back to first picture if no picture is identified as FrontCover', () => {
    const pictures = [
      createMockPicture(PictureType.BackCover, 10),
      createMockPicture(PictureType.Other, 20)
    ];

    const result = extractFrontCover(pictures);
    expect(result).toEqual(new Uint8Array([10, 11, 12]));
  });

  it('returns undefined for empty or undefined picture arrays', () => {
    expect(extractFrontCover(undefined)).toBeUndefined();
    expect(extractFrontCover([])).toBeUndefined();
  });
});
