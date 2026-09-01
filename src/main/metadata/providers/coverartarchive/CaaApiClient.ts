import { HttpError } from '../../../platform/networking/FetchHttpClient';
import type { RequestPipeline } from '../../../platform/networking/RequestPipeline';

export interface CaaThumbnailDto {
  250?: string;
  500?: string;
  1200?: string;
  small?: string;
  large?: string;
}

export interface CaaImageDto {
  id: string | number;
  image: string;
  front: boolean;
  back: boolean;
  types?: string[];
  thumbnails?: CaaThumbnailDto;
  comment?: string;
  approved?: boolean;
}

export interface CaaReleaseResponseDto {
  images?: CaaImageDto[];
  release?: string;
}

export interface CaaContributionData {
  artworkUrl?: string;
  front?: string;
  back?: string;
  thumbnail?: string;
}

export class CaaApiClient {
  private readonly baseUrl = 'https://coverartarchive.org';
  private readonly pipeline: RequestPipeline;

  constructor(pipeline: RequestPipeline) {
    this.pipeline = pipeline;
  }

  public async getReleaseCoverArt(
    mbid: string
  ): Promise<{ data: CaaReleaseResponseDto | null; isNotFound: boolean }> {
    if (!mbid || mbid.trim().length === 0) return { data: null, isNotFound: false };

    const url = `${this.baseUrl}/release/${encodeURIComponent(mbid)}`;

    try {
      // FetchHttpClient throws HttpError for !ok responses, so the resolved
      // status checks below are only reachable through pipelines/mocks that
      // resolve error-shaped results - they intentionally preserve the same
      // contract (404 => isNotFound, other non-2xx => NOT found-flagged, no
      // release-group fallback).
      const response = await this.pipeline.execute<CaaReleaseResponseDto>(url, {
        headers: { 'User-Agent': 'NoraMusicPlayer/1.0' }
      });
      if (response.status === 404) {
        return { data: null, isNotFound: true };
      }
      if (response.status >= 200 && response.status < 300) {
        const hasImages = Array.isArray(response.data?.images) && response.data.images.length > 0;
        return { data: response.data ?? null, isNotFound: !hasImages };
      }
      return { data: null, isNotFound: false };
    } catch (err: unknown) {
      return { data: null, isNotFound: err instanceof HttpError && err.status === 404 };
    }
  }

  public async getReleaseGroupCoverArt(
    mbid: string
  ): Promise<{ data: CaaReleaseResponseDto | null; isNotFound: boolean }> {
    if (!mbid || mbid.trim().length === 0) return { data: null, isNotFound: false };

    const url = `${this.baseUrl}/release-group/${encodeURIComponent(mbid)}`;

    try {
      const response = await this.pipeline.execute<CaaReleaseResponseDto>(url, {
        headers: { 'User-Agent': 'NoraMusicPlayer/1.0' }
      });
      if (response.status === 404) {
        return { data: null, isNotFound: true };
      }
      if (response.status >= 200 && response.status < 300) {
        const hasImages = Array.isArray(response.data?.images) && response.data.images.length > 0;
        return { data: response.data ?? null, isNotFound: !hasImages };
      }
      return { data: null, isNotFound: false };
    } catch (err: unknown) {
      return { data: null, isNotFound: err instanceof HttpError && err.status === 404 };
    }
  }

  public async fetchContributionData(query: {
    mbid?: string;
    releaseId?: string;
    releaseGroupId?: string;
  }): Promise<CaaContributionData | null> {
    const targetMbid = query.mbid ?? query.releaseId;
    let data: CaaReleaseResponseDto | null = null;
    let isNotFound = false;

    if (targetMbid) {
      const res = await this.getReleaseCoverArt(targetMbid);
      data = res.data;
      isNotFound = res.isNotFound;
    } else {
      isNotFound = true;
    }

    // Invariant: ONLY fallback to release group on genuine 404 / no-artwork condition.
    // Network errors / timeouts / 5xx do NOT trigger release-group fallback.
    if ((!data || !data.images || data.images.length === 0) && isNotFound && query.releaseGroupId) {
      const rgRes = await this.getReleaseGroupCoverArt(query.releaseGroupId);
      data = rgRes.data;
    }

    if (!data || !data.images || data.images.length === 0) return null;

    const frontImg = data.images.find((img) => img.front) ?? data.images[0];
    const backImg = data.images.find((img) => img.back);

    const mainArtwork = frontImg.image;
    const frontUrl = frontImg.image;
    const backUrl = backImg?.image;
    const thumbUrl =
      frontImg.thumbnails?.['500'] ??
      frontImg.thumbnails?.large ??
      frontImg.thumbnails?.small ??
      frontImg.image;

    return {
      artworkUrl: mainArtwork,
      front: frontUrl,
      back: backUrl,
      thumbnail: thumbUrl
    };
  }
}
