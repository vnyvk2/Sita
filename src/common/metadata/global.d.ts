import type { MetadataAutoTagApi } from './api';

declare global {
  interface Window {
    api?: {
      metadataAutoTag?: MetadataAutoTagApi;
      [key: string]: unknown;
    };
  }
}

export {};
