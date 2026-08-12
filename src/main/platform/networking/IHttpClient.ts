export interface HttpRequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  responseType?: 'json' | 'text' | 'buffer';
}

export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  url: string;
}

export interface IHttpClient {
  request<T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>>;
  get<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'url' | 'method'>): Promise<HttpResponse<T>>;
  post<T = unknown>(url: string, body?: unknown, options?: Omit<HttpRequestOptions, 'url' | 'method' | 'body'>): Promise<HttpResponse<T>>;
}
