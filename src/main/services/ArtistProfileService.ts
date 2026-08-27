import { getArtistById, getArtistsByName } from '@main/db/queries/artists';
import { ITunesApiClient } from '@main/platform/networking/ITunesApiClient';
import { normalizeForMatching } from '@main/metadata/matching/normalizeForMatching';
import getArtistInfoFromLastFM from '@main/other/lastFm/getArtistInfoFromLastFM';
import getArtistTopTracksFromLastFM, { type LastFmTopTrack } from '@main/other/lastFm/getArtistTopTracksFromLastFM';
import { convertToArtist } from '@main/utils/convert';
import type {
  ArtistOnlineProfilePayload,
  ArtistPopularTrack
} from '../../types/artist_discography';
import type { SimilarArtist } from '../../types/last_fm_artist_info_api';
import logger from '../logger';

export class ArtistProfileService {
  private readonly itunesClient: ITunesApiClient;

  constructor(itunesClient?: ITunesApiClient) {
    this.itunesClient = itunesClient ?? new ITunesApiClient();
  }

  /**
   * Resolves the full enriched online profile for an artist.
   */
  public async getProfile(artistId: number, artistName: string): Promise<ArtistOnlineProfilePayload> {
    logger.debug(`[ArtistProfileService] Resolving profile for artist: ${artistName} (ID: ${artistId})`);

    const fallbackPayload: ArtistOnlineProfilePayload = {
      artistId,
      artistName,
      tags: [],
      topTracks: [],
      similarArtists: { availableArtists: [], unAvailableArtists: [] },
      externalLinks: []
    };

    try {
      // 1. Fetch local artist songs
      const localArtist = await getArtistById(artistId);
      const localSongs = (localArtist?.songs ?? []).map((s) => s.song).filter(Boolean);

      const localSongMap = new Map<string, number>();
      for (const s of localSongs) {
        if (s?.title) {
          const norm = normalizeForMatching(s.title);
          if (norm) localSongMap.set(norm, s.id);
        }
      }

      // 2. Concurrently fetch Last.fm info, Last.fm top tracks, and iTunes top tracks
      const [lastFmInfoRes, lastFmTopTracksRes, itunesTopTracksRes] = await Promise.allSettled([
        getArtistInfoFromLastFM(artistName),
        getArtistTopTracksFromLastFM(artistName, 10),
        this.itunesClient.getArtistTopTracks(artistName, 10)
      ]);

      const lastFmInfo = lastFmInfoRes.status === 'fulfilled' ? lastFmInfoRes.value : null;
      const lastFmTracks = lastFmTopTracksRes.status === 'fulfilled' ? lastFmTopTracksRes.value : [];
      const itunesTracks = itunesTopTracksRes.status === 'fulfilled' ? itunesTopTracksRes.value : [];

      // 3. Extract bio and tags
      let bio: string | undefined = undefined;
      let bioUrl: string | undefined = undefined;
      let tags: Array<{ name: string; url: string }> = [];

      if (lastFmInfo?.artist) {
        bio = lastFmInfo.artist.bio?.summary;
        bioUrl = lastFmInfo.artist.url;
        tags = (lastFmInfo.artist.tags?.tag || []).map((t) => ({
          name: t.name,
          url: t.url
        }));
      }

      // 4. Build Popular Tracks (Top 10)
      const topTracks = this.buildPopularTracks(lastFmTracks, itunesTracks, localSongMap);

      // 5. Build Similar Artists
      const similarArtists = await this.buildSimilarArtists(lastFmInfo);

      // 6. Build External Links
      const externalLinks = this.buildExternalLinks(artistName, lastFmInfo?.artist?.url);

      return {
        artistId,
        artistName,
        bio,
        bioUrl,
        tags,
        topTracks,
        similarArtists,
        externalLinks
      };
    } catch (err) {
      logger.error(`[ArtistProfileService] Failed to resolve profile for ${artistName}`, { error: err });
      return fallbackPayload;
    }
  }

  private buildPopularTracks(
    lastFmTracks: LastFmTopTrack[],
    itunesTracks: any[],
    localSongMap: Map<string, number>
  ): ArtistPopularTrack[] {
    const popularTracks: ArtistPopularTrack[] = [];
    const seenTitles = new Set<string>();

    // Map iTunes tracks by normalized title for quick audio preview pairing
    const itunesMap = new Map<string, any>();
    for (const it of itunesTracks) {
      const norm = normalizeForMatching(it.trackName);
      if (norm) itunesMap.set(norm, it);
    }

    // Process Last.fm tracks first if available
    if (lastFmTracks.length > 0) {
      for (const lt of lastFmTracks) {
        const norm = normalizeForMatching(lt.name);
        if (!norm || seenTitles.has(norm)) continue;
        seenTitles.add(norm);

        const localSongId = localSongMap.get(norm);
        const itunesMatch = itunesMap.get(norm);

        popularTracks.push({
          id: lt.url || lt.name,
          title: lt.name,
          listeners: lt.listeners ? Number(lt.listeners) : undefined,
          playcount: lt.playcount ? Number(lt.playcount) : undefined,
          previewUrl: itunesMatch?.previewUrl,
          albumTitle: itunesMatch?.collectionName,
          coverMedium: itunesMatch?.artworkUrl600 || itunesMatch?.artworkUrl100,
          localSongId,
          isInLibrary: localSongId !== undefined
        });
      }
    } else if (itunesTracks.length > 0) {
      // Direct iTunes top songs ranking (guaranteed global availability)
      for (const it of itunesTracks) {
        const title = it.trackName;
        const norm = normalizeForMatching(title);
        if (!norm || seenTitles.has(norm)) continue;
        seenTitles.add(norm);

        const localSongId = localSongMap.get(norm);

        popularTracks.push({
          id: it.trackId,
          title,
          duration: Math.round((it.trackTimeMillis || 0) / 1000),
          previewUrl: it.previewUrl,
          albumTitle: it.collectionName,
          coverMedium: it.artworkUrl600 || it.artworkUrl100,
          localSongId,
          isInLibrary: localSongId !== undefined
        });
      }
    }

    return popularTracks.slice(0, 10);
  }

  private async buildSimilarArtists(lastFmInfo: any): Promise<SimilarArtistInfo> {
    const unparsedSimilar = lastFmInfo?.artist?.similar?.artist || [];
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

  private buildExternalLinks(
    artistName: string,
    lastFmUrl?: string
  ): Array<{ name: string; url: string; icon: string }> {
    const links: Array<{ name: string; url: string; icon: string }> = [];
    const encoded = encodeURIComponent(artistName);

    if (lastFmUrl) {
      links.push({ name: 'Last.fm', url: lastFmUrl, icon: 'public' });
    } else {
      links.push({ name: 'Last.fm', url: `https://www.last.fm/music/${encoded}`, icon: 'public' });
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
}

export const artistProfileService = new ArtistProfileService();
