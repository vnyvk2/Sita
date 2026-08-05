import { FetchHttpClient, RequestPipeline, type RequestPipelineOptions } from './networking';

export interface PlatformContainer {
  httpClient: FetchHttpClient;
  requestPipeline: RequestPipeline;
}

export class PlatformBootstrap {
  private static containerPromise: Promise<PlatformContainer> | null = null;

  public static async getInstance(options?: RequestPipelineOptions): Promise<PlatformContainer> {
    if (!this.containerPromise) {
      this.containerPromise = this.bootstrap(options);
    }
    return this.containerPromise;
  }

  public static async bootstrap(options?: RequestPipelineOptions): Promise<PlatformContainer> {
    const httpClient = new FetchHttpClient();
    const requestPipeline = new RequestPipeline({
      client: httpClient,
      ...options
    });

    return {
      httpClient,
      requestPipeline
    };
  }
}
