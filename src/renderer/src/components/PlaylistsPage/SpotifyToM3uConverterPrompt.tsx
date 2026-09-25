import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import Button from '../Button';

interface SpotifyToM3uConverterPromptProps {
  onClose?: () => void;
}

interface SongInfo {
  title: string;
  artist?: string;
  originalLocation?: string;
}

const SpotifyToM3uConverterPrompt: React.FC<SpotifyToM3uConverterPromptProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allSongs, setAllSongs] = useState<SongInfo[]>([]);
  const [hasScanned, setHasScanned] = useState(false);

  const handleSpotifyScan = async () => {
    try {
      if (!spotifyUrl) return;

      const urlObj = new URL(spotifyUrl);
      const parts = urlObj.pathname.split('/');
      const playlistIndex = parts.indexOf('playlist');
      if (playlistIndex === -1 || !parts[playlistIndex + 1]) {
        throw new Error('Invalid Spotify Playlist URL');
      }
      
      const playlistId = parts[playlistIndex + 1].split('?')[0];

      setLoading(true);
      setError(null);
      setHasScanned(false);

      const all: SongInfo[] = [];

      // 1. Try public embed fetch first (no auth, no developer setup, no 403)
      try {
        const embedRes = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const html = await embedRes.text();
        const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
        if (m) {
          const data = JSON.parse(m[1]);
          const entity = data.props?.pageProps?.state?.data?.entity;
          if (entity?.trackList && Array.isArray(entity.trackList)) {
            for (const t of entity.trackList) {
              const artist = t.subtitle || '';
              const title = t.title || 'Unknown Title';
              all.push({
                title,
                artist,
                originalLocation: `${artist ? `${artist} - ` : ''}${title}.mp3`
              });
            }
          }
        }
      } catch (embedErr) {
        console.warn('Public embed fetch failed, falling back to authenticated API', embedErr);
      }

      // 2. Fallback to authenticated API if embed didn't find tracks
      if (all.length === 0) {
        const plan = await (window.api.spotify as any).generateImportPlan(playlistId);
        for (const entry of plan.entries) {
          const track = entry.source.trackReference.resolvedTrack?.track || entry.source.trackReference.track;
          all.push({
            title: track.title || track.originalLocation || 'Unknown Title',
            artist: track.artist,
            originalLocation: track.originalLocation
          });
        }
      }

      if (all.length === 0) {
        throw new Error('No songs could be found in this playlist.');
      }

      setAllSongs(all);
      setHasScanned(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to fetch Spotify playlist.');
    } finally {
      setLoading(false);
    }
  };

  const exportM3u = () => {
    let m3u = "#EXTM3U\n";
    for (const song of allSongs) {
      const title = song.title;
      const artist = song.artist ? `${song.artist} - ` : '';
      m3u += `#EXTINF:-1,${artist}${title}\n${song.originalLocation || `${artist}${title}.mp3`}\n`;
    }

    const blob = new Blob([m3u], { type: 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spotify_playlist.m3u';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="spotify-to-m3u-converter text-font-color-black dark:text-font-color-white flex w-[30rem] max-w-[90vw] flex-col rounded-2xl bg-white p-6 shadow-2xl dark:bg-black">
      <div className="title-container mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-medium">{t('Convert Spotify to M3U', 'Convert Spotify to M3U')}</h2>
        {onClose && (
          <Button
            iconName="close"
            className="rounded-full p-2 hover:bg-stone-200 dark:hover:bg-stone-800"
            clickHandler={onClose}
          />
        )}
      </div>

      {!hasScanned && (
        <div className="input-section flex flex-col gap-6">
          <p className="text-sm opacity-80">
            Convert a Spotify Playlist URL into an M3U file instantly.
          </p>

          <div className="spotify-input flex flex-col gap-2">
            <label htmlFor="spotify-converter-url-input" className="text-sm font-medium">Spotify Playlist URL</label>
            <div className="flex gap-2">
              <input
                id="spotify-converter-url-input"
                name="spotifyUrl"
                value={spotifyUrl}
                onChange={(e) => setSpotifyUrl(e.currentTarget.value)}
                placeholder="https://open.spotify.com/playlist/..."
                className="flex-1 rounded-md border border-stone-300 p-2 text-sm outline-none focus:border-font-color-highlight dark:border-stone-700 dark:bg-stone-900"
                onKeyDown={(e) => e.key === 'Enter' && handleSpotifyScan()}
              />
              <Button
                label="Fetch"
                iconName="download"
                isDisabled={!spotifyUrl || loading}
                clickHandler={handleSpotifyScan}
              />
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <span className="material-icons-round animate-spin text-4xl text-font-color-highlight dark:text-dark-font-color-highlight">
            sync
          </span>
          <p className="animate-pulse">Fetching playlist from Spotify...</p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-100 p-4 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <p className="flex items-center gap-2">
            <span className="material-icons-round text-xl">error_outline</span>
            {error}
          </p>
        </div>
      )}

      {hasScanned && !loading && (
        <div className="results-section flex flex-col gap-6">
          <div className="stats flex justify-center rounded-xl bg-stone-100 p-4 dark:bg-stone-900">
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold text-font-color-highlight dark:text-dark-font-color-highlight">{allSongs.length}</span>
              <span className="text-xs uppercase opacity-70">Songs Found</span>
            </div>
          </div>

          <Button
            label="Download M3U File"
            iconName="save"
            className="w-full justify-center bg-font-color-highlight text-white hover:bg-font-color-highlight/90 dark:bg-dark-font-color-highlight dark:text-black"
            clickHandler={exportM3u}
          />

          <Button
            label="Convert Another"
            iconName="refresh"
            className="w-full justify-center mt-2"
            clickHandler={() => setHasScanned(false)}
          />
        </div>
      )}
    </div>
  );
};

export default SpotifyToM3uConverterPrompt;
