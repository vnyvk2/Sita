import { getArtistById, getArtistsByName } from '@main/db/queries/artists';
import getArtistInfoFromLastFM from '@main/other/lastFm/getArtistInfoFromLastFM';
import getArtistTopTracksFromLastFM, {
  type LastFmTopTrack
} from '@main/other/lastFm/getArtistTopTracksFromLastFM';
import { DeezerApiClient } from '@main/platform/networking/DeezerApiClient';
import { ITunesApiClient } from '@main/platform/networking/ITunesApiClient';
import { WikipediaApiClient } from '@main/platform/networking/WikipediaApiClient';
import { convertToArtist } from '@main/utils/convert';
import { normalizeBioText } from '@main/utils/normalizeBioText';
import {
  deduplicateCandidateTracks,
  matchOnlineTrackToLocalSong,
  normalizeTrackTitle,
  type LocalSongMatchCandidate
} from '@main/utils/normalizeTrackTitle';

import type {
  ArtistFeaturedImage,
  ArtistOnlineProfilePayload,
  ArtistPopularTrack
} from '../../types/artist_discography';
import type { SimilarArtist, SimilarArtistInfo } from '../../types/last_fm_artist_info_api';
import logger from '../logger';

interface CacheEntry {
  payload: ArtistOnlineProfilePayload;
  cachedAt: number;
}

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const CACHE_MAX_ENTRIES = 50;
const GLOBAL_TIMEOUT_MS = 8000; // 8s global budget

export class ArtistProfileService {
  private readonly itunesClient: ITunesApiClient;
  private readonly deezerClient: DeezerApiClient;
  private readonly wikiClient: WikipediaApiClient;

  // In-flight promise deduplication map
  private readonly inFlight = new Map<number, Promise<ArtistOnlineProfilePayload>>();
  // Capped in-memory LRU cache
  private readonly cache = new Map<number, CacheEntry>();

  constructor(
    itunesClient?: ITunesApiClient,
    deezerClient?: DeezerApiClient,
    wikiClient?: WikipediaApiClient
  ) {
    this.itunesClient = itunesClient ?? new ITunesApiClient();
    this.deezerClient = deezerClient ?? new DeezerApiClient();
    this.wikiClient = wikiClient ?? new WikipediaApiClient();
  }

  /**
   * Resolves the full enriched online profile for an artist. Leverages in-flight deduplication and
   * bounded caching.
   */
  public getProfile(artistId: number, artistName: string): Promise<ArtistOnlineProfilePayload> {
    const trimmedName = artistName.trim();
    logger.debug(`[ArtistProfileService] Resolving profile for: ${trimmedName} (ID: ${artistId})`);

    // 1. Check in-flight promise
    const ongoing = this.inFlight.get(artistId);
    if (ongoing) {
      return ongoing;
    }

    // 2. Check LRU Cache
    const cached = this.cache.get(artistId);
    if (cached) {
      const isNegative = cached.payload.topTracks.length === 0 && !cached.payload.bioSummary;
      const ttl = isNegative ? 60 * 1000 : CACHE_TTL_MS; // 60s for negative cache vs 1h for full profiles

      if (Date.now() - cached.cachedAt < ttl) {
        // Refresh LRU recency in Map iteration order
        this.cache.delete(artistId);
        this.cache.set(artistId, cached);

        // Refresh local artwork dynamically in case user added/updated local files
        return this.refreshLocalDetails(artistId, cached.payload);
      }
      this.cache.delete(artistId);
    }

    // 3. Launch resolution with in-flight tracking
    const requestPromise = this.resolveProfileInternal(artistId, trimmedName).finally(() => {
      this.inFlight.delete(artistId);
    });

    this.inFlight.set(artistId, requestPromise);
    return requestPromise;
  }

  private async resolveProfileInternal(
    artistId: number,
    artistName: string
  ): Promise<ArtistOnlineProfilePayload> {
    const fallbackPayload: ArtistOnlineProfilePayload = {
      artistId,
      artistName,
      fetchedAt: Date.now(),
      bioParagraphs: [],
      tags: [],
      topTracks: [],
      similarArtists: { availableArtists: [], unAvailableArtists: [] },
      externalLinks: this.buildExternalLinks(artistName)
    };

    // Controller with global timeout budget (~8s)
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT_MS);

    try {
      // Fetch local artist songs & artwork
      const localArtist = await getArtistById(artistId);
      const localSongs: LocalSongMatchCandidate[] = (localArtist?.songs ?? [])
        .map((s) => s.song)
        .filter(Boolean)
        .map((s) => ({
          id: s!.id,
          title: s!.title,
          duration: s!.duration
        }));

      // Parallel independent pipelines using Promise.allSettled with shared abort signal
      const [lastFmInfoRes, lastFmTracksRes, itunesTracksRes, deezerArtistRes, wikiBioRes] =
        await Promise.allSettled([
          getArtistInfoFromLastFM(artistName, controller.signal),
          getArtistTopTracksFromLastFM(artistName, 15, controller.signal),
          this.itunesClient.getArtistTopTracks(artistName, 15, controller.signal),
          this.deezerClient.searchArtist(artistName, controller.signal),
          this.wikiClient.getArtistBiography(artistName, controller.signal)
        ]);

      const lastFmInfo = lastFmInfoRes.status === 'fulfilled' ? lastFmInfoRes.value : null;
      const lastFmTracks = lastFmTracksRes.status === 'fulfilled' ? lastFmTracksRes.value : [];
      const itunesTracks = itunesTracksRes.status === 'fulfilled' ? itunesTracksRes.value : [];
      const deezerArtist = deezerArtistRes.status === 'fulfilled' ? deezerArtistRes.value : null;
      const wikiBio = wikiBioRes.status === 'fulfilled' ? wikiBioRes.value : null;

      // 1. Resolve Biography with Quality Gating
      const { bioSummary, bioFull, bioParagraphs, bioSource, bioUrl } = this.resolveBiography(
        lastFmInfo,
        wikiBio
      );

      // 2. Resolve Featured Image with Provenance
      const featuredImage = this.resolveFeaturedImage(
        localArtist,
        deezerArtist,
        wikiBio,
        itunesTracks
      );

      // 3. Resolve Top Tracks with strict ranking & deduplication
      let deezerTopTracks: any[] = [];
      if (lastFmTracks.length === 0 && deezerArtist?.id) {
        try {
          deezerTopTracks = await this.deezerClient.getArtistTopTracks(
            deezerArtist.id,
            15,
            controller.signal
          );
        } catch {
          deezerTopTracks = [];
        }
      }

      const topTracks = this.buildTopTracks(
        lastFmTracks,
        deezerTopTracks,
        itunesTracks,
        localSongs
      );

      // 4. Resolve Similar Artists
      const similarArtists = await this.resolveSimilarArtists(
        lastFmInfo,
        deezerArtist?.id,
        controller.signal
      );

      // 5. Extract Tags & External Links
      const tags = this.extractTags(lastFmInfo, wikiBio);
      const externalLinks = this.buildExternalLinks(
        artistName,
        lastFmInfo?.artist?.url,
        wikiBio?.pageUrl
      );

      const payload: ArtistOnlineProfilePayload = {
        artistId,
        artistName,
        fetchedAt: Date.now(),
        bioSummary,
        bioFull,
        bioParagraphs,
        bioSource,
        bioUrl,
        featuredImage,
        tags,
        topTracks,
        similarArtists,
        externalLinks
      };

      // Store in LRU cache
      this.addToCache(artistId, payload);

      return payload;
    } catch (err) {
      logger.error(`[ArtistProfileService] Failed to resolve profile for ${artistName}`, {
        error: err
      });
      this.addToCache(artistId, fallbackPayload);
      return fallbackPayload;
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  /** Resolves the biography using quality-gated Last.fm -> Wikipedia fallback. */
  private resolveBiography(
    lastFmInfo: any,
    wikiBio: any
  ): {
    bioSummary?: string;
    bioFull?: string;
    bioParagraphs: string[];
    bioSource?: 'Last.fm' | 'Wikipedia';
    bioUrl?: string;
  } {
    // 1. Try Last.fm biography
    const rawLastFmContent = lastFmInfo?.artist?.bio?.content || lastFmInfo?.artist?.bio?.summary;
    if (rawLastFmContent) {
      const normalized = normalizeBioText(rawLastFmContent);
      if (normalized.isValid && normalized.paragraphs.length > 0) {
        return {
          bioSummary: normalized.summary,
          bioFull: normalized.fullText,
          bioParagraphs: normalized.paragraphs,
          bioSource: 'Last.fm',
          bioUrl: lastFmInfo.artist.url
        };
      }
    }

    // 2. Fallback to Wikipedia biography
    if (wikiBio?.fullExtract) {
      const normalizedWiki = normalizeBioText(wikiBio.fullExtract, 80); // Wikipedia extracts are authoritative
      if (normalizedWiki.isValid && normalizedWiki.paragraphs.length > 0) {
        return {
          bioSummary: wikiBio.summary || normalizedWiki.summary,
          bioFull: normalizedWiki.fullText,
          bioParagraphs: normalizedWiki.paragraphs,
          bioSource: 'Wikipedia',
          bioUrl: wikiBio.pageUrl
        };
      }
    }

    return {
      bioParagraphs: []
    };
  }

  private extractLocalArtwork(localArtist: any): string | undefined {
    if (!localArtist) return undefined;
    if (
      localArtist.onlineArtworkPaths?.picture_xl ||
      localArtist.onlineArtworkPaths?.picture_medium
    ) {
      return (
        localArtist.onlineArtworkPaths.picture_xl || localArtist.onlineArtworkPaths.picture_medium
      );
    }
    if (localArtist.artworkPaths?.artworkPath) {
      return localArtist.artworkPaths.artworkPath;
    }
    if (Array.isArray(localArtist.artworks)) {
      try {
        const converted = convertToArtist(localArtist);
        return (
          converted.onlineArtworkPaths?.picture_xl ||
          converted.onlineArtworkPaths?.picture_medium ||
          converted.artworkPaths?.artworkPath
        );
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  /** Resolves the featured image prioritizing Local -> Deezer -> Wikipedia -> iTunes. */
  private resolveFeaturedImage(
    localArtist: any,
    deezerArtist: any,
    wikiBio: any,
    itunesTracks: any[]
  ): ArtistFeaturedImage | undefined {
    // 1. Local artwork (cached or embedded)
    const localArt = this.extractLocalArtwork(localArtist);
    if (localArt) {
      return {
        url: localArt,
        source: 'Local'
      };
    }

    // 2. Deezer high-resolution photo
    const deezerArt =
      deezerArtist?.picture_xl || deezerArtist?.picture_big || deezerArtist?.picture_medium;
    if (deezerArt && !deezerArt.includes('placeholder')) {
      return {
        url: deezerArt,
        source: 'Deezer'
      };
    }

    // 3. Wikipedia original image or thumbnail
    const wikiArt = wikiBio?.originalImage || wikiBio?.thumbnail;
    if (wikiArt) {
      return {
        url: wikiArt,
        source: 'Wikipedia'
      };
    }

    // 4. iTunes collection artwork from top track
    const itunesArt = itunesTracks.find((t) => t.artworkUrl600 || t.artworkUrl100);
    if (itunesArt) {
      return {
        url: itunesArt.artworkUrl600 || itunesArt.artworkUrl100,
        source: 'iTunes'
      };
    }

    return undefined;
  }

  /**
   * Builds the top tracks array with strict global rankings, title deduplication, 30s preview
   * enrichment, and local library matching.
   */
  private buildTopTracks(
    lastFmTracks: LastFmTopTrack[],
    deezerTracks: any[],
    itunesTracks: any[],
    localSongs: LocalSongMatchCandidate[]
  ): ArtistPopularTrack[] {
    const popularTracks: ArtistPopularTrack[] = [];

    // Map iTunes tracks by normalized title for 30s preview enrichment
    const itunesMap = new Map<string, any>();
    for (const it of itunesTracks) {
      const norm = normalizeTrackTitle(it.trackName);
      if (norm && !itunesMap.has(norm)) {
        itunesMap.set(norm, it);
      }
    }

    // 1. Primary Ranking: Last.fm Top Tracks
    if (lastFmTracks.length > 0) {
      // Deduplicate candidate tracks first (remasters/live versions)
      const deduped = deduplicateCandidateTracks(
        lastFmTracks.map((t) => ({
          title: t.name,
          listeners: t.listeners ? Number(t.listeners) : undefined,
          playcount: t.playcount ? Number(t.playcount) : undefined,
          url: t.url
        }))
      );

      let rank = 1;
      for (const lt of deduped) {
        if (rank > 10) break;

        const itunesMatch = itunesMap.get(normalizeTrackTitle(lt.title));
        const durationSec = itunesMatch?.trackTimeMillis
          ? Math.round(itunesMatch.trackTimeMillis / 1000)
          : undefined;

        const localMatch = matchOnlineTrackToLocalSong(lt.title, durationSec, localSongs);

        popularTracks.push({
          id: lt.url || `lastfm-${rank}-${lt.title}`,
          globalRank: rank,
          title: lt.title,
          listeners: lt.listeners,
          playcount: lt.playcount,
          durationSec,
          albumTitle: itunesMatch?.collectionName,
          coverMedium: itunesMatch?.artworkUrl600 || itunesMatch?.artworkUrl100,
          previewUrl: itunesMatch?.previewUrl,
          previewProvider: itunesMatch?.previewUrl ? 'iTunes' : undefined,
          localSongId: localMatch?.localSongId,
          isInLibrary: localMatch !== null,
          matchConfidence: localMatch?.confidence
        });

        rank++;
      }
      return popularTracks;
    }

    // 2. Fallback Ranking: Deezer Top Tracks
    if (deezerTracks.length > 0) {
      const dedupedDeezer = deduplicateCandidateTracks(
        deezerTracks.map((dt) => ({
          title: dt.title,
          durationSec: dt.duration,
          previewUrl: dt.preview,
          albumTitle: dt.album?.title,
          coverMedium: dt.album?.cover_medium || dt.album?.cover_big,
          raw: dt
        }))
      );

      let rank = 1;
      for (const dt of dedupedDeezer) {
        if (rank > 10) break;

        const itunesMatch = itunesMap.get(normalizeTrackTitle(dt.title));
        const previewUrl = dt.previewUrl || itunesMatch?.previewUrl;
        const previewProvider = dt.previewUrl
          ? 'Deezer'
          : itunesMatch?.previewUrl
            ? 'iTunes'
            : undefined;
        const durationSec =
          dt.durationSec ||
          (itunesMatch?.trackTimeMillis
            ? Math.round(itunesMatch.trackTimeMillis / 1000)
            : undefined);

        const localMatch = matchOnlineTrackToLocalSong(dt.title, durationSec, localSongs);

        popularTracks.push({
          id: dt.raw?.id || `deezer-${rank}-${dt.title}`,
          globalRank: rank,
          title: dt.title,
          durationSec,
          albumTitle: dt.albumTitle || itunesMatch?.collectionName,
          coverMedium: dt.coverMedium || itunesMatch?.artworkUrl600 || itunesMatch?.artworkUrl100,
          previewUrl,
          previewProvider,
          localSongId: localMatch?.localSongId,
          isInLibrary: localMatch !== null,
          matchConfidence: localMatch?.confidence
        });

        rank++;
      }
      return popularTracks;
    }

    // 3. Fallback Ranking: iTunes Direct Search Tracks
    if (itunesTracks.length > 0) {
      const dedupedITunes = deduplicateCandidateTracks(
        itunesTracks.map((it) => ({
          title: it.trackName,
          durationSec: it.trackTimeMillis ? Math.round(it.trackTimeMillis / 1000) : undefined,
          previewUrl: it.previewUrl,
          albumTitle: it.collectionName,
          coverMedium: it.artworkUrl600 || it.artworkUrl100,
          id: it.trackId
        }))
      );

      let rank = 1;
      for (const it of dedupedITunes) {
        if (rank > 10) break;

        const localMatch = matchOnlineTrackToLocalSong(it.title, it.durationSec, localSongs);

        popularTracks.push({
          id: it.id || `itunes-${rank}-${it.title}`,
          globalRank: rank,
          title: it.title,
          durationSec: it.durationSec,
          albumTitle: it.albumTitle,
          coverMedium: it.coverMedium,
          previewUrl: it.previewUrl,
          previewProvider: it.previewUrl ? 'iTunes' : undefined,
          localSongId: localMatch?.localSongId,
          isInLibrary: localMatch !== null,
          matchConfidence: localMatch?.confidence
        });

        rank++;
      }
    }

    return popularTracks;
  }

  /** Resolves similar artists from Last.fm with Deezer related artists fallback. */
  private async resolveSimilarArtists(
    lastFmInfo: any,
    deezerArtistId?: number,
    signal?: AbortSignal
  ): Promise<SimilarArtistInfo> {
    let unparsedSimilar = lastFmInfo?.artist?.similar?.artist || [];

    // Fallback to Deezer related artists if Last.fm returned no similar artists
    if (unparsedSimilar.length === 0 && deezerArtistId) {
      try {
        const deezerRelated = await this.deezerClient.getRelatedArtists(deezerArtistId, 10, signal);
        unparsedSimilar = deezerRelated.map((da) => ({
          name: da.name,
          url: da.link || `https://www.deezer.com/artist/${da.id}`
        }));
      } catch {
        unparsedSimilar = [];
      }
    }

    if (unparsedSimilar.length === 0) {
      return { availableArtists: [], unAvailableArtists: [] };
    }

    const names = unparsedSimilar.map((a: any) => a.name);
    const similarArtists = await getArtistsByName(names);

    const grouped = Object.groupBy(unparsedSimilar, (a: any) =>
      similarArtists?.some((b) => b.name.toLowerCase() === a.name.toLowerCase())
        ? 'available'
        : 'unavailable'
    );

    const { available = [], unavailable = [] } = grouped;

    const availableArtists: SimilarArtist[] = available.map((a: any) => {
      const match = similarArtists.find((s) => s.name.toLowerCase() === a.name.toLowerCase())!;
      return {
        name: a.name,
        url: a.url,
        artistData: convertToArtist(match)
      };
    });

    const unAvailableArtists: SimilarArtist[] = unavailable.map((a: any) => ({
      name: a.name,
      url: a.url
    }));

    return { availableArtists, unAvailableArtists };
  }

  private extractTags(lastFmInfo: any, wikiBio: any): Array<{ name: string; url: string }> {
    const rawTags = lastFmInfo?.artist?.tags?.tag || [];
    if (rawTags.length > 0) {
      return rawTags.map((t: any) => ({
        name: t.name,
        url: t.url
      }));
    }

    if (wikiBio?.description) {
      return [{ name: wikiBio.description, url: wikiBio.pageUrl }];
    }

    return [];
  }

  private buildExternalLinks(
    artistName: string,
    lastFmUrl?: string,
    wikiUrl?: string
  ): Array<{ name: string; url: string; icon: string }> {
    const links: Array<{ name: string; url: string; icon: string }> = [];
    const encoded = encodeURIComponent(artistName);

    if (lastFmUrl) {
      links.push({ name: 'Last.fm', url: lastFmUrl, icon: 'public' });
    } else {
      links.push({ name: 'Last.fm', url: `https://www.last.fm/music/${encoded}`, icon: 'public' });
    }

    if (wikiUrl) {
      links.push({ name: 'Wikipedia', url: wikiUrl, icon: 'menu_book' });
    } else {
      links.push({
        name: 'Wikipedia',
        url: `https://en.wikipedia.org/wiki/${encoded}`,
        icon: 'menu_book'
      });
    }

    links.push({
      name: 'Apple Music',
      url: `https://music.apple.com/us/search?term=${encoded}`,
      icon: 'graphic_eq'
    });

    links.push({
      name: 'Spotify',
      url: `https://open.spotify.com/search/${encoded}`,
      icon: 'open_in_new'
    });

    links.push({
      name: 'MusicBrainz',
      url: `https://musicbrainz.org/search?query=${encoded}&type=artist`,
      icon: 'library_music'
    });

    links.push({
      name: 'Bandcamp',
      url: `https://bandcamp.com/search?q=${encoded}&item_type=b`,
      icon: 'album'
    });

    return links;
  }

  private async refreshLocalDetails(
    artistId: number,
    cachedPayload: ArtistOnlineProfilePayload
  ): Promise<ArtistOnlineProfilePayload> {
    const localArtist = await getArtistById(artistId);
    if (!localArtist) return cachedPayload;

    const localArt = this.extractLocalArtwork(localArtist);

    const featuredImage: ArtistFeaturedImage | undefined = localArt
      ? { url: localArt, source: 'Local' }
      : cachedPayload.featuredImage;

    return {
      ...cachedPayload,
      featuredImage
    };
  }

  private addToCache(artistId: number, payload: ArtistOnlineProfilePayload): void {
    if (this.cache.has(artistId)) {
      this.cache.delete(artistId);
    } else if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(artistId, {
      payload,
      cachedAt: Date.now()
    });
  }
}

export const artistProfileService = new ArtistProfileService();
