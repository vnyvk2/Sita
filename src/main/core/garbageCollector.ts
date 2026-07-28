import { db } from '@main/db/db';
import { sweepUnusedArtworks } from '@main/other/artworks';

export async function collectGarbageArtworks(): Promise<number> {
  return await sweepUnusedArtworks();
}
