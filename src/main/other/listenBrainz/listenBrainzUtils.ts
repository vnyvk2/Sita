import { app, net } from 'electron';

export const LISTENBRAINZ_BASE_URL = 'https://api.listenbrainz.org/1';
export const LISTENBRAINZ_REQUEST_TIMEOUT_MS = 10000;

export const getListenBrainzUserAgent = (): string => {
  const version = app?.getVersion ? app.getVersion() : '1.0.0';
  return `Nora/${version} (https://github.com/Sandakan/Nora)`;
};

export const fetchWithTimeout = async (
  url: URL | string,
  options: RequestInit = {},
  timeoutMs: number = LISTENBRAINZ_REQUEST_TIMEOUT_MS,
  externalSignal?: AbortSignal
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const fetchImpl = typeof net !== 'undefined' && typeof net.fetch === 'function' ? net.fetch : fetch;
    const response = await fetchImpl(url.toString(), {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
};
