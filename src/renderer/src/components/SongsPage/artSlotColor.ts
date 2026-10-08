/**
 * Deterministic per-song artwork slot color.
 *
 * Painted behind row thumbnails so the art slot is never a blank box while
 * the photo decodes: the row mounts complete (text + colored slot) and the
 * photo crossfades in over it. Pure function of songId, so a song keeps the
 * same slot color across scrolls, remounts and windows — no color flashing.
 */
export function artSlotColor(songId: number): string {
  const id = Number.isFinite(songId) ? Math.floor(Math.abs(songId)) : 0;
  const hue = (id * 47 + 13) % 360;
  return `hsl(${hue} 28% 26%)`;
}
