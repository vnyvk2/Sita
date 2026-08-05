import { FetchHttpClient, RequestPipeline, type RequestPipelineOptions } from './networking';

export class PlatformBootstrap {
  private static instance: PlatformBootstrap | null = null;
  private readonly sharedHttpClient: FetchHttpClient;

  private constructor() {
    this.sharedHttpClient = new FetchHttpClient();
  }

  public static getInstance(): PlatformBootstrap {
    if (!this.instance) {
      this.instance = new PlatformBootstrap();
    }
    return this.instance;
  }

  public get httpClient(): FetchHttpClient {
    return this.sharedHttpClient;
  }

  public createRequestPipeline(options?: Partial<RequestPipelineOptions>): RequestPipeline {
    return new RequestPipeline({
      client: this.sharedHttpClient,
      ...options
    });
  }
}
