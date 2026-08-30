import { db } from '@db/db';
import { albumsSongs, artistsSongs, genresSongs, playlistEntries } from '@db/schema';
import { asc, eq, inArray, sql, and } from 'drizzle-orm';

import type { MembershipEntry } from '../models/MembershipEntry';
import type { MembershipEntityKind, MembershipReference } from '../models/MembershipReference';
import type { IMembershipRepository } from './IMembershipRepository';

export class DatabaseMembershipRepository implements IMembershipRepository {
  private readonly database: DB | DBTransaction;

  constructor(trx: DB | DBTransaction = db) {
    this.database = trx;
  }

  public async getMembers(
    collection: MembershipReference,
    _memberKind: MembershipEntityKind
  ): Promise<MembershipEntry[]> {
    const colId = typeof collection.id === 'number' ? collection.id : parseInt(String(collection.id), 10);
    if (isNaN(colId)) return [];

    switch (collection.kind) {
      case 'playlist': {
        const rows = await this.database.query.playlistEntries.findMany({
          where: eq(playlistEntries.playlistId, colId),
          orderBy: [asc(playlistEntries.position), asc(playlistEntries.id)]
        });
        return rows.map((r) => ({
          collectionKind: 'playlist',
          collectionId: r.playlistId,
          memberKind: 'song',
          memberId: r.songId,
          position: r.position,
          addedAt: r.addedAt ? new Date(r.addedAt).getTime() : undefined
        }));
      }

      case 'album': {
        const rows = await this.database.query.albumsSongs.findMany({
          where: eq(albumsSongs.albumId, colId),
          with: {
            song: {
              columns: { id: true, trackNumber: true, title: true }
            }
          }
        });
        // Sort deterministically: trackNumber ASC if present, then song id ASC
        const sorted = [...rows].sort((a, b) => {
          const tA = a.song?.trackNumber ?? Infinity;
          const tB = b.song?.trackNumber ?? Infinity;
          if (tA !== tB) return tA - tB;
          return a.songId - b.songId;
        });
        return sorted.map((r, idx) => ({
          collectionKind: 'album',
          collectionId: r.albumId,
          memberKind: 'song',
          memberId: r.songId,
          position: idx + 1
        }));
      }

      case 'artist': {
        const rows = await this.database.query.artistsSongs.findMany({
          where: eq(artistsSongs.artistId, colId),
          orderBy: [asc(artistsSongs.songId)]
        });
        return rows.map((r, idx) => ({
          collectionKind: 'artist',
          collectionId: r.artistId,
          memberKind: 'song',
          memberId: r.songId,
          position: idx + 1
        }));
      }

      case 'genre': {
        const rows = await this.database.query.genresSongs.findMany({
          where: eq(genresSongs.genreId, colId),
          orderBy: [asc(genresSongs.songId)]
        });
        return rows.map((r, idx) => ({
          collectionKind: 'genre',
          collectionId: r.genreId,
          memberKind: 'song',
          memberId: r.songId,
          position: idx + 1
        }));
      }

      default:
        return [];
    }
  }

  public async getCollectionsContaining(
    member: MembershipReference,
    collectionKind: MembershipEntityKind
  ): Promise<MembershipEntry[]> {
    const memId = typeof member.id === 'number' ? member.id : parseInt(String(member.id), 10);
    if (isNaN(memId)) return [];

    switch (collectionKind) {
      case 'playlist': {
        const rows = await this.database.query.playlistEntries.findMany({
          where: eq(playlistEntries.songId, memId),
          orderBy: [asc(playlistEntries.playlistId)]
        });
        return rows.map((r) => ({
          collectionKind: 'playlist',
          collectionId: r.playlistId,
          memberKind: 'song',
          memberId: r.songId,
          position: r.position
        }));
      }

      case 'album': {
        const rows = await this.database.query.albumsSongs.findMany({
          where: eq(albumsSongs.songId, memId),
          orderBy: [asc(albumsSongs.albumId)]
        });
        return rows.map((r) => ({
          collectionKind: 'album',
          collectionId: r.albumId,
          memberKind: 'song',
          memberId: r.songId
        }));
      }

      case 'artist': {
        const rows = await this.database.query.artistsSongs.findMany({
          where: eq(artistsSongs.songId, memId),
          orderBy: [asc(artistsSongs.artistId)]
        });
        return rows.map((r) => ({
          collectionKind: 'artist',
          collectionId: r.artistId,
          memberKind: 'song',
          memberId: r.songId
        }));
      }

      case 'genre': {
        const rows = await this.database.query.genresSongs.findMany({
          where: eq(genresSongs.songId, memId),
          orderBy: [asc(genresSongs.genreId)]
        });
        return rows.map((r) => ({
          collectionKind: 'genre',
          collectionId: r.genreId,
          memberKind: 'song',
          memberId: r.songId
        }));
      }

      default:
        return [];
    }
  }

  public async getCollectionsContainingMany(
    members: MembershipReference[],
    collectionKind: MembershipEntityKind
  ): Promise<MembershipEntry[]> {
    if (members.length === 0) return [];

    const memberIds = members
      .map((m) => (typeof m.id === 'number' ? m.id : parseInt(String(m.id), 10)))
      .filter((id) => !isNaN(id));

    if (memberIds.length === 0) return [];

    switch (collectionKind) {
      case 'playlist': {
        const rows = await this.database.query.playlistEntries.findMany({
          where: inArray(playlistEntries.songId, memberIds),
          orderBy: [asc(playlistEntries.playlistId)]
        });
        return rows.map((r) => ({
          collectionKind: 'playlist',
          collectionId: r.playlistId,
          memberKind: 'song',
          memberId: r.songId,
          position: r.position
        }));
      }

      case 'album': {
        const rows = await this.database.query.albumsSongs.findMany({
          where: inArray(albumsSongs.songId, memberIds),
          orderBy: [asc(albumsSongs.albumId)]
        });
        return rows.map((r) => ({
          collectionKind: 'album',
          collectionId: r.albumId,
          memberKind: 'song',
          memberId: r.songId
        }));
      }

      case 'artist': {
        const rows = await this.database.query.artistsSongs.findMany({
          where: inArray(artistsSongs.songId, memberIds),
          orderBy: [asc(artistsSongs.artistId)]
        });
        return rows.map((r) => ({
          collectionKind: 'artist',
          collectionId: r.artistId,
          memberKind: 'song',
          memberId: r.songId
        }));
      }

      case 'genre': {
        const rows = await this.database.query.genresSongs.findMany({
          where: inArray(genresSongs.songId, memberIds),
          orderBy: [asc(genresSongs.genreId)]
        });
        return rows.map((r) => ({
          collectionKind: 'genre',
          collectionId: r.genreId,
          memberKind: 'song',
          memberId: r.songId
        }));
      }

      default:
        return [];
    }
  }

  public async contains(
    collection: MembershipReference,
    member: MembershipReference
  ): Promise<boolean> {
    const colId = typeof collection.id === 'number' ? collection.id : parseInt(String(collection.id), 10);
    const memId = typeof member.id === 'number' ? member.id : parseInt(String(member.id), 10);
    if (isNaN(colId) || isNaN(memId)) return false;

    switch (collection.kind) {
      case 'playlist': {
        const entry = await this.database.query.playlistEntries.findFirst({
          where: and(eq(playlistEntries.playlistId, colId), eq(playlistEntries.songId, memId))
        });
        return Boolean(entry);
      }
      case 'album': {
        const entry = await this.database.query.albumsSongs.findFirst({
          where: and(eq(albumsSongs.albumId, colId), eq(albumsSongs.songId, memId))
        });
        return Boolean(entry);
      }
      case 'artist': {
        const entry = await this.database.query.artistsSongs.findFirst({
          where: and(eq(artistsSongs.artistId, colId), eq(artistsSongs.songId, memId))
        });
        return Boolean(entry);
      }
      case 'genre': {
        const entry = await this.database.query.genresSongs.findFirst({
          where: and(eq(genresSongs.genreId, colId), eq(genresSongs.songId, memId))
        });
        return Boolean(entry);
      }
      default:
        return false;
    }
  }

  public async containsMany(
    collection: MembershipReference,
    members: MembershipReference[]
  ): Promise<Map<string | number, boolean>> {
    const resultMap = new Map<string | number, boolean>();
    for (const mem of members) {
      resultMap.set(mem.id, false);
    }

    if (members.length === 0) return resultMap;

    const colId = typeof collection.id === 'number' ? collection.id : parseInt(String(collection.id), 10);
    if (isNaN(colId)) return resultMap;

    const memberIds = members
      .map((m) => (typeof m.id === 'number' ? m.id : parseInt(String(m.id), 10)))
      .filter((id) => !isNaN(id));

    if (memberIds.length === 0) return resultMap;

    switch (collection.kind) {
      case 'playlist': {
        const entries = await this.database.query.playlistEntries.findMany({
          where: and(eq(playlistEntries.playlistId, colId), inArray(playlistEntries.songId, memberIds))
        });
        for (const entry of entries) {
          resultMap.set(entry.songId, true);
        }
        break;
      }
      case 'album': {
        const entries = await this.database.query.albumsSongs.findMany({
          where: and(eq(albumsSongs.albumId, colId), inArray(albumsSongs.songId, memberIds))
        });
        for (const entry of entries) {
          resultMap.set(entry.songId, true);
        }
        break;
      }
      case 'artist': {
        const entries = await this.database.query.artistsSongs.findMany({
          where: and(eq(artistsSongs.artistId, colId), inArray(artistsSongs.songId, memberIds))
        });
        for (const entry of entries) {
          resultMap.set(entry.songId, true);
        }
        break;
      }
      case 'genre': {
        const entries = await this.database.query.genresSongs.findMany({
          where: and(eq(genresSongs.genreId, colId), inArray(genresSongs.songId, memberIds))
        });
        for (const entry of entries) {
          resultMap.set(entry.songId, true);
        }
        break;
      }
    }

    return resultMap;
  }

  public async countMembers(
    collection: MembershipReference,
    _memberKind: MembershipEntityKind
  ): Promise<number> {
    const colId = typeof collection.id === 'number' ? collection.id : parseInt(String(collection.id), 10);
    if (isNaN(colId)) return 0;

    switch (collection.kind) {
      case 'playlist': {
        const result = await this.database
          .select({ count: sql<number>`count(*)` })
          .from(playlistEntries)
          .where(eq(playlistEntries.playlistId, colId));
        return result[0]?.count ?? 0;
      }
      case 'album': {
        const result = await this.database
          .select({ count: sql<number>`count(*)` })
          .from(albumsSongs)
          .where(eq(albumsSongs.albumId, colId));
        return result[0]?.count ?? 0;
      }
      case 'artist': {
        const result = await this.database
          .select({ count: sql<number>`count(*)` })
          .from(artistsSongs)
          .where(eq(artistsSongs.artistId, colId));
        return result[0]?.count ?? 0;
      }
      case 'genre': {
        const result = await this.database
          .select({ count: sql<number>`count(*)` })
          .from(genresSongs)
          .where(eq(genresSongs.genreId, colId));
        return result[0]?.count ?? 0;
      }
      default:
        return 0;
    }
  }

  public async getAllCollectionMemberships(
    _memberKind: MembershipEntityKind
  ): Promise<MembershipEntry[]> {
    const [playlists, albums, artists, genres] = await Promise.all([
      this.database.query.playlistEntries.findMany({
        orderBy: [asc(playlistEntries.playlistId), asc(playlistEntries.position)]
      }),
      this.database.query.albumsSongs.findMany({
        orderBy: [asc(albumsSongs.albumId)]
      }),
      this.database.query.artistsSongs.findMany({
        orderBy: [asc(artistsSongs.artistId)]
      }),
      this.database.query.genresSongs.findMany({
        orderBy: [asc(genresSongs.genreId)]
      })
    ]);

    const results: MembershipEntry[] = [];

    for (const r of playlists) {
      results.push({
        collectionKind: 'playlist',
        collectionId: r.playlistId,
        memberKind: 'song',
        memberId: r.songId,
        position: r.position
      });
    }

    for (const r of albums) {
      results.push({
        collectionKind: 'album',
        collectionId: r.albumId,
        memberKind: 'song',
        memberId: r.songId
      });
    }

    for (const r of artists) {
      results.push({
        collectionKind: 'artist',
        collectionId: r.artistId,
        memberKind: 'song',
        memberId: r.songId
      });
    }

    for (const r of genres) {
      results.push({
        collectionKind: 'genre',
        collectionId: r.genreId,
        memberKind: 'song',
        memberId: r.songId
      });
    }

    return results;
  }
}
