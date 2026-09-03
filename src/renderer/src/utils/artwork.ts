/**
 * Rewrites local artwork URLs (nora://localfiles/ or nora://file/) to the
 * high-efficiency on-demand thumbnail host (nora://thumb/).
 * Remote URLs (Last.fm / Spotify) or data URLs are left untouched.
 */
export const toThumbnailUrl = (src?: string): string | undefined => {
  if (!src) return undefined;
  if (src.startsWith('nora://localfiles/')) {
    return src.replace('nora://localfiles/', 'nora://thumb/');
  }
  if (src.startsWith('nora://file/')) {
    return src.replace('nora://file/', 'nora://thumb/');
  }
  return src;
};
