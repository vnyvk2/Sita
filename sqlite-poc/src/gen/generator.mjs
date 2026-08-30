// Phase 3 — deterministic synthetic library generator.
// Realistic relational distribution (NOT one-album-per-song):
//   - artist popularity follows Zipf: few artists own many songs
//   - albums contain 5-15 tracks; ~94% of songs belong to an album
//   - 30 canonical genres, 1-3 per song
//   - languages weighted; favorites ~10%; blacklist ~2%
//   - metadata overrides on ~3% of songs; artwork dedup via shared hashes (~8%)
//   - play history over last 180 days for ~30% of songs
// Deterministic via mulberry32(seed). Sizes: 1300 / 10000 / 50000 / 100000.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, makeRng } from '../lib/util.mjs';

const WORDS_A = ['midnight', 'golden', 'silent', 'electric', 'crimson', 'velvet', 'lonely', 'neon', 'paper', 'wild', 'broken', 'dancing', 'fading', 'hollow', 'sacred', 'restless', 'endless', 'crystal', 'morning', 'shadow'];
const WORDS_B = ['heart', 'city', 'fire', 'dream', 'river', 'sky', 'love', 'road', 'rain', 'star', 'ocean', 'hymn', 'fever', 'sunset', 'echo', 'train', 'summer', 'winter', 'prayer', 'signal'];
const TITLE_PATTERNS = [
  (r) => `${pick(r, WORDS_A)} ${pick(r, WORDS_B)}`,
  (r) => `${pick(r, WORDS_B)} of the ${pick(r, WORDS_A)} ${pick(r, WORDS_B)}`,
  (r) => `${cap(pick(r, WORDS_A))} ${pick(r, WORDS_B)} (Live)`,
  (r) => `${pick(r, WORDS_A)} ${pick(r, WORDS_B)}, Pt. ${1 + Math.floor(r() * 3)}`,
  (r) => `${pick(r, WORDS_B)}-${pick(r, WORDS_B)}`,
  (r) => `${pick(r, WORDS_A).toUpperCase()} ${pick(r, WORDS_B).toUpperCase()}`,
  (r) => `${cap(pick(r, WORDS_A))} ${pick(r, WORDS_B)} [Remastered 20${10 + Math.floor(r() * 15)}]`,
  (r) => `${pick(r, WORDS_A)} ${pick(r, WORDS_B)} — feat. ${cap(pick(r, FIRST))}`
];
const FIRST = ['arjun', 'meera', 'john', 'lena', 'yuki', 'carlos', 'aisha', 'viktor', 'nadia', 'sienna', 'hiro', 'kavya', 'dmitri', 'ines', 'tariq', 'ellen', 'raj', 'sofia', 'kenji', 'mara'];
const LAST = ['sharma', 'okafor', 'petrov', 'tanaka', 'silva', 'novak', 'kumar', 'haddad', 'nilsen', 'moreno', 'kavinsky', 'ishikawa', 'fernandes', 'bergström', 'okafor', 'rathnayake', 'perera', 'johnson', 'müller', 'rossi'];
const BANDS = ['the {a} {b}', '{a} & the {b}s', '{b} society', 'orchestra of {a} {b}', '{a} {b} collective', '{b} avenue', 'the {b} cartel', '{a}tide', '{b} horizon'];
const ALBUM_PATTERNS = [
  (r) => `${cap(pick(r, WORDS_A))} ${pick(r, WORDS_B)}`,
  (r) => `${cap(pick(r, WORDS_B))} Studies`,
  (r) => `Vol. ${1 + Math.floor(r() * 5)}: ${cap(pick(r, WORDS_A))}`,
  (r) => `${cap(pick(r, FIRST))} in ${cap(pick(r, WORDS_B))}`,
  (r) => `Live at the ${cap(pick(r, WORDS_A))} ${pick(r, ['Hall', 'Club', 'Theatre', 'Ballroom'])}`,
  (r) => `the ${pick(r, WORDS_A)} tapes`
];
const GENRES = ['pop', 'rock', 'hip hop', 'jazz', 'classical', 'electronic', 'r&b', 'country', 'reggae', 'metal', 'punk', 'indie', 'folk', 'blues', 'soul', 'funk', 'ambient', 'techno', 'house', 'lo-fi', 'bollywood', 'carnatic', 'hindustani', 'baila', 'k-pop', 'city pop', 'bossa nova', 'gospel', 'disco', 'synthwave'];
const LANGS = [['en', 0.45], ['si', 0.15], ['hi', 0.12], ['es', 0.10], ['ko', 0.08], ['ja', 0.06], ['ta', 0.04]];
const UNICODE_TITLES = ['夢のつづき', '星に願いを', 'जादू नगरी', 'මිහිරාවී', 'corações de veludo', 'la vie en rose', 'Åh Nära', 'אין לי ארץ אחרת', 'город огней', 'บ้านบนเมฆ'];

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function zipfArtistIndex(r, nArtists) {
  // skewed: artist 0 ~40x more songs than artist n/10
  const u = r();
  const idx = Math.floor(Math.pow(u, 2.2) * nArtists);
  return Math.min(nArtists - 1, idx);
}

function weightedPick(r, pairs) {
  let x = r();
  for (const [v, w] of pairs) {
    if ((x -= w) <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
}

function isoDaysAgo(rng, days) {
  const t = Date.now() - rng() * days * 86400000;
  return new Date(t).toISOString().replace('Z', '') + 'Z';
}

export function generateDataset(nSongs, seed = 42) {
  const t0 = performance.now();
  const rng = makeRng(seed);
  const r = makeRng(seed ^ 0x9e3779b9);

  const nArtists = Math.max(8, Math.round(nSongs / 11));
  const artists = [];
  for (let i = 0; i < nArtists; i++) {
    const isBand = r() < 0.4;
    const name = isBand
      ? pick(r, BANDS).replace('{a}', pick(r, WORDS_A)).replace('{b}', pick(r, WORDS_B))
      : `${cap(pick(r, FIRST))} ${cap(pick(r, LAST))}`;
    artists.push({
      name,
      isFavorite: r() < 0.15 ? 1 : 0,
      createdAt: isoDaysAgo(rng, 720)
    });
  }

  const nGenres = GENRES.length;
  const genres = GENRES.map((name) => ({ name, createdAt: isoDaysAgo(rng, 720) }));

  // albums: each artist 1-6 albums
  const albums = [];
  for (const a of artists) {
    const n = 1 + Math.floor(r() * 6);
    for (let i = 0; i < n; i++) {
      albums.push({
        title: pick(r, ALBUM_PATTERNS)(r),
        year: 1960 + Math.floor(Math.pow(r(), 1.4) * 66),
        artistIndex: artists.indexOf(a),
        isFavorite: r() < 0.1 ? 1 : 0,
        createdAt: isoDaysAgo(rng, 700)
      });
    }
  }

  // artwork: one hash per album with 8% shared across albums + a few song-level covers
  const artworkHashes = [];
  const albumsArtwork = new Array(albums.length);
  const nUniqueArt = Math.ceil(albums.length * 0.92);
  for (let i = 0; i < nUniqueArt; i++) {
    artworkHashes.push(sha1ish(r));
  }
  for (let i = 0; i < albums.length; i++) {
    const h = r() < 0.08 ? artworkHashes[Math.floor(r() * nUniqueArt)] : artworkHashes[i % nUniqueArt];
    albumsArtwork[i] = h;
  }
  const artworks = [...new Set(albumsArtwork)].map((h) => ({
    hash: h,
    path: `C:\\Users\\demo\\Music\\song_covers\\${h}.webp`,
    source: 'LOCAL',
    width: 500,
    height: 500,
    isOptimized: r() < 0.5 ? 1 : 0,
    generatorVersion: 1,
    createdAt: isoDaysAgo(rng, 700)
  }));
  const artworkIdByHash = new Map(artworks.map((a, i) => [a.hash, i + 1]));

  // songs
  const songs = [];
  const songsArtists = [];
  const albumSongs = [];
  const genresSongs = [];
  const albumsArtists = [];
  const seenAlbumArtist = new Set();
  const albumTrackCount = new Map();

  for (let i = 0; i < nSongs; i++) {
    const albumIndex = r() < 0.94 ? Math.floor(r() * albums.length) : -1;
    const artistIndex = albumIndex >= 0 ? albums[albumIndex].artistIndex : zipfArtistIndex(r, nArtists);
    const trackNumber = albumIndex >= 0 ? (albumTrackCount.get(albumIndex) ?? 0) % 15 + 1 : 1;
    if (albumIndex >= 0) albumTrackCount.set(albumIndex, (albumTrackCount.get(albumIndex) ?? 0) + 1);
    const title = r() < 0.01 ? pick(r, UNICODE_TITLES) : pick(r, TITLE_PATTERNS)(r);
    const songId = i + 1;
    songs.push({
      title,
      duration: Math.round((120 + Math.pow(r(), 1.3) * 330) * 1000) / 1000,
      skipCount: Math.floor(Math.pow(r(), 3) * 25),
      path: `C:\\Users\\demo\\Music\\Library\\artist_${artistIndex}\\album_${albumIndex >= 0 ? albumIndex : 'singles'}\\${String(i).padStart(6, '0')} - ${title.replace(/[\\/:*?"<>|]/g, '_')}.mp3`,
      isFavorite: r() < 0.10 ? 1 : 0,
      sampleRate: pick(r, [44100, 48000, 96000]),
      bitRate: pick(r, [128000, 192000, 256000, 320000]),
      noOfChannels: r() < 0.9 ? 2 : 6,
      year: albumIndex >= 0 ? albums[albumIndex].year : 1960 + Math.floor(Math.pow(r(), 1.4) * 66),
      diskNumber: 1,
      trackNumber,
      folderId: 1,
      isBlacklisted: r() < 0.02 ? 1 : 0,
      fileCreatedAt: isoDaysAgo(rng, 700),
      fileModifiedAt: isoDaysAgo(rng, 700),
      musicBrainzRecordingId: r() < 0.6 ? `mbid-${Math.floor(r() * 1e12).toString(36)}` : null,
      isrc: r() < 0.5 ? `ISRC${Math.floor(r() * 1e9)}` : null,
      language: weightedPick(r, LANGS),
      createdAt: isoDaysAgo(rng, 700),
      updatedAt: isoDaysAgo(rng, 60)
    });
    songsArtists.push({ artistId: artistIndex + 1, songId });
    // featured artist on ~12%
    if (r() < 0.12) {
      const feat = zipfArtistIndex(r, nArtists);
      if (feat !== artistIndex) songsArtists.push({ artistId: feat + 1, songId });
    }
    if (albumIndex >= 0) {
      albumSongs.push({ albumId: albumIndex + 1, songId });
      const key = `${albumIndex + 1}:${artistIndex + 1}`;
      if (!seenAlbumArtist.has(key)) {
        seenAlbumArtist.add(key);
        albumsArtists.push({ albumId: albumIndex + 1, artistId: artistIndex + 1 });
      }
    }
    const nGenres = 1 + Math.floor(Math.pow(r(), 1.5) * 3);
    const used = new Set();
    for (let g = 0; g < nGenres; g++) {
      const gi = Math.floor(r() * nGenres);
      if (!used.has(gi)) {
        used.add(gi);
        genresSongs.push({ genreId: gi + 1, songId });
      }
    }
  }

  const artworksSongs = [];
  const albumsArtworks = [];
  const seenAlbumArtwork = new Set();
  for (const { albumId } of albumSongs) {
    const h = albumsArtwork[albumId - 1];
    const artId = artworkIdByHash.get(h);
    const key = `${albumId}:${artId}`;
    if (!seenAlbumArtwork.has(key)) {
      seenAlbumArtwork.add(key);
      albumsArtworks.push({ albumId, artworkId: artId });
    }
  }
  // 4% of songs carry direct artwork links (embedded covers) — only hashes that exist
  const artworkIdPool = [...new Set(albumsArtwork)].map((h) => artworkIdByHash.get(h));
  for (let i = 0; i < nSongs; i++) {
    if (r() < 0.04) {
      artworksSongs.push({ artworkId: artworkIdPool[Math.floor(r() * artworkIdPool.length)], songId: i + 1 });
    }
  }

  // metadata overrides: 3% of songs, 1-2 fields
  const metadataOverrides = [];
  for (let i = 0; i < nSongs; i++) {
    if (r() < 0.03) {
      const n = r() < 0.7 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const fieldId = k === 0 ? 'title' : 'year';
        metadataOverrides.push({
          entityKind: 'song',
          entityId: String(i + 1),
          fieldId,
          value: fieldId === 'title' ? `${songs[i].title} (fixed)` : String(1960 + Math.floor(r() * 66)),
          createdAt: isoDaysAgo(rng, 90),
          updatedAt: isoDaysAgo(rng, 30)
        });
      }
    }
  }

  // playlists
  const playlists = [];
  const playlistEntries = [];
  for (let p = 0; p < 12; p++) {
    const pid = p + 1;
    playlists.push({
      id: pid,
      name: `${cap(pick(r, WORDS_A))} ${cap(pick(r, WORDS_B))} ${pid}`,
      description: null,
      playlistType: 'standard',
      itemCount: 0,
      totalDuration: 0,
      createdAt: isoDaysAgo(rng, 400)
    });
    const n = 20 + Math.floor(r() * 1980);
    for (let k = 0; k < n; k++) {
      playlistEntries.push({ playlistId: pid, songId: 1 + Math.floor(r() * nSongs), position: k });
    }
  }
  for (const p of playlists) p.itemCount = playlistEntries.reduce((acc, e) => acc + (e.playlistId === p.id ? 1 : 0), 0);

  // play events / history
  const playEvents = [];
  const playHistory = [];
  for (let i = 0; i < nSongs; i++) {
    if (r() < 0.30) {
      const n = Math.floor(Math.pow(r(), 2) * 20);
      for (let k = 0; k < n; k++) {
        const at = isoDaysAgo(rng, 180);
        playEvents.push({ songId: i + 1, playedAt: at, playbackPercentage: Math.round(r() * 1000) / 10, createdAt: at });
        playHistory.push({ songId: i + 1, playedAt: at, createdAt: at });
      }
    }
  }

  const musicFolders = [
    { path: 'C:\\Users\\demo\\Music\\Library', name: 'Library', isBlacklisted: 0, parentId: null, createdAt: isoDaysAgo(rng, 720) }
  ];

  const userSettings = [{ language: 'en', zoomFactor: 1, recentSearches: JSON.stringify(['golden hour', 'neon rain']) }];

  const dataset = {
    seed,
    nSongs,
    counts: {
      artists: artists.length,
      albums: albums.length,
      songs: songs.length,
      genres: genres.length,
      artworks: artworks.length,
      songsArtists: songsArtists.length,
      albumSongs: albumSongs.length,
      genresSongs: genresSongs.length,
      albumsArtists: albumsArtists.length,
      artworksSongs: artworksSongs.length,
      albumsArtworks: albumsArtworks.length,
      metadataOverrides: metadataOverrides.length,
      playlists: playlists.length,
      playlistEntries: playlistEntries.length,
      playEvents: playEvents.length,
      playHistory: playHistory.length
    },
    tables: {
      musicFolders,
      artists,
      genres,
      albums,
      artworks,
      songs,
      songsArtists,
      albumSongs,
      genresSongs,
      albumsArtists,
      artworksSongs,
      albumsArtworks,
      metadataOverrides,
      playlists,
      playlistEntries,
      playEvents,
      playHistory,
      userSettings
    }
  };
  dataset.genMs = performance.now() - t0;
  return dataset;
}

function sha1ish(r) {
  let s = '';
  for (let i = 0; i < 40; i++) s += '0123456789abcdef'[Math.floor(r() * 16)];
  return s;
}

// ---------------------------------------------------------------- caching
export function datasetFile(nSongs) {
  return path.join(DATA_DIR, `dataset-${nSongs}.json`);
}

export async function getDataset(nSongs, { regenerate = false } = {}) {
  mkdirSync(DATA_DIR, { recursive: true });
  const file = datasetFile(nSongs);
  if (!regenerate && existsSync(file)) {
    const t0 = performance.now();
    const ds = JSON.parse(readFileSync(file, 'utf8'));
    ds.loadMs = performance.now() - t0;
    return ds;
  }
  const ds = generateDataset(nSongs);
  writeFileSync(file, JSON.stringify(ds));
  return ds;
}

// CLI: node src/gen/generate.mjs 50000
if (process.argv[1] && process.argv[1].endsWith('generator.mjs')) {
  const sizes = process.argv.slice(2).map(Number);
  for (const n of (sizes.length ? sizes : [1300, 10000, 50000, 100000])) {
    const ds = generateDataset(n);
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(datasetFile(n), JSON.stringify(ds));
    console.log(`dataset ${n}: gen=${(ds.genMs / 1000).toFixed(2)}s counts=${JSON.stringify(ds.counts)}`);
  }
}
