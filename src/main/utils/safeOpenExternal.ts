import { shell } from 'electron';

import logger from '../logger';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Safely opens an external URL in the system's default browser.
 * Rejects any non-http(s) protocols (e.g., file:, search-ms:, ms-msdt:, calc:)
 * to prevent arbitrary local executable launching or URL scheme hijacking.
 */
export async function safeOpenExternal(rawUrl: string): Promise<boolean> {
  if (typeof rawUrl !== 'string') {
    logger.warn('Blocked external URL navigation: URL is not a string', { rawUrl });
    return false;
  }

  try {
    const parsed = new URL(rawUrl);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
      logger.warn('Blocked dangerous external URL protocol', {
        protocol: parsed.protocol,
        url: rawUrl
      });
      return false;
    }

    await shell.openExternal(rawUrl);
    return true;
  } catch (error) {
    logger.warn('Blocked invalid external URL', { rawUrl, error });
    return false;
  }
}

export default safeOpenExternal;
