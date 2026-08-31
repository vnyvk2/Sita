import type { HttpRequestOptions, HttpResponse, IHttpClient } from './IHttpClient';

export class HttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly responseUrl: string;
  public readonly responseBody?: unknown;
  public readonly responseHeaders?: Record<string, string>;

  constructor(
    status: number,
    statusText: string,
    responseUrl: string,
    responseBody?: unknown,
    responseHeaders?: Record<string, string>
  ) {
    super(`HTTP Error ${status} (${statusText}) for URL: ${responseUrl}`);
    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
    this.responseUrl = responseUrl;
    this.responseBody = responseBody;
    this.responseHeaders = responseHeaders;
  }
}

export class FetchHttpClient implements IHttpClient {
  private readonly defaultTimeoutMs: number;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options?: { defaultTimeoutMs?: number; defaultHeaders?: Record<string, string> }) {
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 10000;
    this.defaultHeaders = options?.defaultHeaders ?? {
      'User-Agent': 'NoraMusicPlayer/1.0.0 (https://github.com/vnyvk2/MyNora)'
    };
  }

  public async request<T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const { url, method = 'GET', headers = {}, params, body, timeoutMs, signal } = options;

    const fullUrl = this.buildUrl(url, params);
    const timeout = timeoutMs ?? this.defaultTimeoutMs;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const mergedSignal = signal
      ? this.combineSignals(signal, controller.signal)
      : controller.signal;

    const requestHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...headers
    };

    let requestBody: string | undefined = undefined;
    if (body !== undefined && body !== null) {
      if (typeof body === 'string') {
        requestBody = body;
      } else {
        requestBody = JSON.stringify(body);
        if (!requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
          requestHeaders['Content-Type'] = 'application/json';
        }
      }
    }

    try {
      const response = await fetch(fullUrl, {
        method,
        headers: requestHeaders,
        body: requestBody,
        signal: mergedSignal
      });

      clearTimeout(timer);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      let responseData: unknown = undefined;
      if (options.responseType === 'buffer') {
        const arrayBuf = await response.arrayBuffer();
        responseData = Buffer.from(arrayBuf);
      } else {
        const contentType = responseHeaders['content-type'] ?? '';
        if (contentType.includes('application/json')) {
          responseData = await response.json();
        } else {
          const text = await response.text();
          try {
            responseData = JSON.parse(text);
          } catch {
            responseData = text;
          }
        }
      }

      if (!response.ok) {
        throw new HttpError(response.status, response.statusText, fullUrl, responseData, responseHeaders);
      }

      return {
        data: responseData as T,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        url: fullUrl
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof HttpError) {
        throw err;
      }
      if (signal?.aborted) {
        // Caller-initiated cancellation. Preserve AbortError identity so downstream
        // retry / timeout / circuit-breaker stages treat this as cancellation,
        // never as a timeout or provider failure.
        const abortError = new Error('Operation aborted', { cause: err });
        abortError.name = 'AbortError';
        throw abortError;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        // Only the internal timeout timer remains as a possible abort source here.
        throw new Error(`Request timed out after ${timeout}ms: ${fullUrl}`);
      }
      throw err;
    }
  }

  public async get<T = unknown>(
    url: string,
    options?: Omit<HttpRequestOptions, 'url' | 'method'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: 'GET' });
  }

  public async post<T = unknown>(
    url: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'url' | 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: 'POST', body });
  }

  private buildUrl(url: string, params?: Record<string, string | number | boolean | undefined>): string {
    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const parsedUrl = new URL(url);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        parsedUrl.searchParams.append(key, String(value));
      }
    });
    return parsedUrl.toString();
  }

  private combineSignals(userSignal: AbortSignal, timeoutSignal: AbortSignal): AbortSignal {
    if (userSignal.aborted) return userSignal;
    if (timeoutSignal.aborted) return timeoutSignal;

    // AbortSignal.any derives a signal without attaching listeners to the
    // source signals, so reusing a long-lived caller signal across many
    // requests never accumulates listeners.
    return AbortSignal.any([userSignal, timeoutSignal]);
  }
}
