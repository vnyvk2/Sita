const KNOWN_SUFFIX_REGEX =
  /\s*(\((?:deluxe|deluxe edition|expanded edition|remastered(?:\s+\d{4})?|\d{4}\s+remaster|anniversary edition|collector's edition|bonus track version|explicit|clean|mono|stereo|live|acoustic|taylor's version)\)|\[explicit\])\s*$/i;

export class AlbumSuffixPreserver {
  /**
   * Intelligently preserves local album title suffixes (e.g. "(Deluxe)", "(Taylor's Version)", "[Explicit]")
   * when the base album title matches the provider's canonical album title.
   */
  public static preserveAlbumSuffix(localAlbum?: string, remoteAlbum?: string): string | undefined {
    if (!localAlbum || !remoteAlbum) {
      return remoteAlbum;
    }

    const trimmedLocal = localAlbum.trim();
    const trimmedRemote = remoteAlbum.trim();

    const match = trimmedLocal.match(KNOWN_SUFFIX_REGEX);
    if (!match) {
      return remoteAlbum; // No release descriptor suffix in local title
    }

    const localSuffix = match[1];
    const localBase = trimmedLocal.replace(KNOWN_SUFFIX_REGEX, '').trim().toLowerCase();
    const remoteBase = trimmedRemote.replace(KNOWN_SUFFIX_REGEX, '').trim().toLowerCase();

    // Preserve suffix ONLY if base album titles match
    if (localBase === remoteBase) {
      // Don't duplicate suffix if remote already contains it
      if (trimmedRemote.toLowerCase().includes(localSuffix.toLowerCase())) {
        return remoteAlbum;
      }
      return `${trimmedRemote} ${localSuffix}`;
    }

    return remoteAlbum;
  }
}
