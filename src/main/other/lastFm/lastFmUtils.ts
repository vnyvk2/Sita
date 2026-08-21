export const LASTFM_REQUEST_TIMEOUT_MS = 10_000;
export const LASTFM_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

export const fetchWithTimeout = async (
  url: URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (init.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      init.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (init.signal) {
      init.signal.removeEventListener('abort', onExternalAbort);
    }
  }
};
