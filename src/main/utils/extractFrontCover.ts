import { PictureType } from 'node-taglib-sharp';

export interface TaglibPictureLike {
  data: {
    toByteArray: () => Uint8Array;
  };
  pictureType?: number | string;
}

export function extractFrontCover(
  pictures?: TaglibPictureLike[]
): Uint8Array | undefined {
  if (!pictures || pictures.length === 0) {
    return undefined;
  }

  const frontPicture =
    pictures.find(
      (p) =>
        p.pictureType === PictureType.FrontCover ||
        p.pictureType === 3 ||
        String(p.pictureType).toLowerCase() === 'frontcover'
    ) ?? pictures[0];

  return frontPicture?.data?.toByteArray();
}
