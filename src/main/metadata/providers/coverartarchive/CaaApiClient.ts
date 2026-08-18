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

  public async getReleaseCoverArt(mbid: string): Promise<CaaReleaseResponseDto | null> {
    if (!mbid || mbid.trim().length === 0) return null;

    const url = `${this.baseUrl}/release/${encodeURIComponent(mbid)}`;

    try {
      const response = await this.pipeline.execute<CaaReleaseResponseDto>(url, {
        headers: { 'User-Agent': 'NoraMusicPlayer/1.0' }
      });
      return response.data ?? null;
    } catch {
      return null;
    }
  }

  public async getReleaseGroupCoverArt(mbid: string): Promise<CaaReleaseResponseDto | null> {
    if (!mbid || mbid.trim().length === 0) return null;

    const url = `${this.baseUrl}/release-group/${encodeURIComponent(mbid)}`;

    try {
      const response = await this.pipeline.execute<CaaReleaseResponseDto>(url, {
        headers: { 'User-Agent': 'NoraMusicPlayer/1.0' }
      });
      return response.data ?? null;
    } catch {
      return null;
    }
  }

  public async fetchContributionData(query: {
    mbid?: string;
    releaseId?: string;
    releaseGroupId?: string;
  }): Promise<CaaContributionData | null> {
    const targetMbid = query.mbid ?? query.releaseId;
    let data: CaaReleaseResponseDto | null = null;

    if (targetMbid) {
      data = await this.getReleaseCoverArt(targetMbid);
    }

    // If release lookup has no artwork/images (e.g. 404), fallback to release group
    if ((!data || !data.images || data.images.length === 0) && query.releaseGroupId) {
      data = await this.getReleaseGroupCoverArt(query.releaseGroupId);
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
