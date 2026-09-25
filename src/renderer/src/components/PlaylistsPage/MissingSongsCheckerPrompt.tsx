import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import Button from '../Button';

interface MissingSongsCheckerPromptProps {
  onClose?: () => void;
}

interface MissingSongInfo {
  title: string;
  artist?: string;
  originalLocation?: string;
}

const MissingSongsCheckerPrompt: React.FC<MissingSongsCheckerPromptProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foundCount, setFoundCount] = useState(0);
  const [missingSongs, setMissingSongs] = useState<MissingSongInfo[]>([]);
  const [allSongs, setAllSongs] = useState<MissingSongInfo[]>([]);
  const [hasScanned, setHasScanned] = useState(false);

  const handleM3uScan = async () => {
    try {
      const result: any = await window.api.utils.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Playlists', extensions: ['m3u', 'm3u8'] }]
      });

      const filePaths = result?.filePaths || result;
      if (!filePaths || filePaths.length === 0) return;

      setLoading(true);
      setError(null);
      setHasScanned(false);

      const filePath = filePaths[0];
      const plan = await (window.api.collections as any).preview(filePath);

      processPlan(plan);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to analyze M3U file.');
    } finally {
      setLoading(false);
    }
  };

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

      let plan: any = null;
      try {
        plan = await (window.api.spotify as any).generateImportPlan(playlistId);
      } catch (authErr) {
        console.warn('Authenticated Spotify API failed, falling back to public embed...', authErr);
      }

      if (plan) {
        processPlan(plan);
      } else {
        // Public embed fallback
        const embedRes = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const html = await embedRes.text();
        const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
        if (!m) {
          throw new Error('Failed to fetch Spotify playlist. Please ensure the playlist is public.');
        }

        const data = JSON.parse(m[1]);
        const entity = data.props?.pageProps?.state?.data?.entity;
        const trackList = entity?.trackList;
        if (!trackList || !Array.isArray(trackList) || trackList.length === 0) {
          throw new Error('No tracks found in this playlist.');
        }

        // Compare against local library
        const localSongs = await window.api.audioLibraryControls.getAllSongs();
        const localList = localSongs?.data || [];
        const localTitles = new Set(
          localList.map((s) => s.title.toLowerCase().replace(/[^a-z0-9]/g, ''))
        );

        let found = 0;
        const missing: MissingSongInfo[] = [];
        const all: MissingSongInfo[] = [];

        for (const t of trackList) {
          const title = t.title || 'Unknown Title';
          const artist = t.subtitle || '';
          const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
          const songInfo: MissingSongInfo = {
            title,
            artist,
            originalLocation: `${artist ? `${artist} - ` : ''}${title}.mp3`
          };

          all.push(songInfo);

          if (localTitles.has(normTitle)) {
            found++;
          } else {
            missing.push(songInfo);
          }
        }

        setFoundCount(found);
        setMissingSongs(missing);
        setAllSongs(all);
        setHasScanned(true);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to analyze Spotify playlist.');
    } finally {
      setLoading(false);
    }
  };

  const processPlan = (plan: any) => {
    let found = 0;
    const missing: MissingSongInfo[] = [];
    const all: MissingSongInfo[] = [];

    for (const entry of plan.entries) {
      const decision = entry.decision;
      const track = entry.source.trackReference.resolvedTrack?.track || entry.source.trackReference.track;
      
      const songInfo = {
        title: track.title || track.originalLocation || 'Unknown Title',
        artist: track.artist,
        originalLocation: track.originalLocation
      };

      all.push(songInfo);

      if (decision === 'SKIP_NOT_IN_LIBRARY' || decision === 'SKIP_MISSING' || decision === 'MISSING') {
        missing.push(songInfo);
      } else {
        found++;
      }
    }

    setFoundCount(found);
    setMissingSongs(missing);
    setAllSongs(all);
    setHasScanned(true);
  };

  const exportM3u = (songsList: MissingSongInfo[], filename: string) => {
    let m3u = "#EXTM3U\n";
    for (const song of songsList) {
      const title = song.title;
      const artist = song.artist ? `${song.artist} - ` : '';
      m3u += `#EXTINF:-1,${artist}${title}\n${song.originalLocation || `${artist}${title}.mp3`}\n`;
    }

    const blob = new Blob([m3u], { type: 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="missing-songs-checker-prompt text-font-color-black dark:text-font-color-white flex w-[30rem] max-w-[90vw] flex-col rounded-2xl bg-white p-6 shadow-2xl dark:bg-black">
      <div className="title-container mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-medium">{t('Check Missing Songs', 'Check Missing Songs')}</h2>
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
            Check which songs from a playlist are missing from your Nora library, or convert a Spotify playlist to an M3U file.
          </p>

          <div className="spotify-input flex flex-col gap-2">
            <label htmlFor="missing-checker-spotify-url" className="text-sm font-medium">Spotify Playlist URL</label>
            <div className="flex gap-2">
              <input
                id="missing-checker-spotify-url"
                name="spotifyUrl"
                value={spotifyUrl}
                onChange={(e) => setSpotifyUrl(e.currentTarget.value)}
                placeholder="https://open.spotify.com/playlist/..."
                className="flex-1 rounded-md border border-stone-300 p-2 text-sm outline-none focus:border-font-color-highlight dark:border-stone-700 dark:bg-stone-900"
                onKeyDown={(e) => e.key === 'Enter' && handleSpotifyScan()}
              />
              <Button
                label="Scan"
                iconName="search"
                isDisabled={!spotifyUrl || loading}
                clickHandler={handleSpotifyScan}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 opacity-50">
            <hr className="flex-1 border-stone-300 dark:border-stone-700" />
            <span className="text-xs uppercase">OR</span>
            <hr className="flex-1 border-stone-300 dark:border-stone-700" />
          </div>

          <div className="m3u-input flex flex-col items-center gap-3 rounded-xl border border-dashed border-stone-300 p-6 dark:border-stone-700">
            <span className="material-icons-round text-4xl opacity-50">queue_music</span>
            <p className="text-center text-sm opacity-80">Select an M3U playlist file from your computer</p>
            <Button
              label="Select M3U File"
              iconName="folder_open"
              isDisabled={loading}
              clickHandler={handleM3uScan}
            />
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <span className="material-icons-round animate-spin text-4xl text-font-color-highlight dark:text-dark-font-color-highlight">
            sync
          </span>
          <p className="animate-pulse">Scanning library...</p>
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
          <div className="stats flex justify-between rounded-xl bg-stone-100 p-4 dark:bg-stone-900">
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold text-green-600 dark:text-green-400">{foundCount}</span>
              <span className="text-xs uppercase opacity-70">In Library</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold text-red-600 dark:text-red-400">{missingSongs.length}</span>
              <span className="text-xs uppercase opacity-70">Missing</span>
            </div>
          </div>

          {missingSongs.length > 0 ? (
            <>
              <div className="missing-list max-h-60 overflow-y-auto rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                <ul className="flex flex-col gap-1">
                  {missingSongs.map((song, i) => (
                    <li key={i} className="flex flex-col py-1 text-sm">
                      <span className="font-medium">{song.title}</span>
                      {song.artist && <span className="text-xs opacity-70">{song.artist}</span>}
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                label="Export Missing to M3U"
                iconName="download"
                className="w-full justify-center bg-font-color-highlight text-white hover:bg-font-color-highlight/90 dark:bg-dark-font-color-highlight dark:text-black"
                clickHandler={() => exportM3u(missingSongs, 'missing_songs.m3u')}
              />
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-green-600 dark:text-green-400">
              <span className="material-icons-round text-5xl">check_circle</span>
              <p className="font-medium">You have all the songs in your library!</p>
            </div>
          )}

          {allSongs.length > 0 && (
            <Button
              label="Export ENTIRE Playlist to M3U"
              iconName="library_music"
              className="w-full justify-center border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800"
              clickHandler={() => exportM3u(allSongs, 'spotify_playlist.m3u')}
              tooltipLabel="Convert the original playlist to an M3U file"
            />
          )}

          <Button
            label="Scan Another"
            iconName="refresh"
            className="w-full justify-center mt-2"
            clickHandler={() => setHasScanned(false)}
          />
        </div>
      )}
    </div>
  );
};

export default MissingSongsCheckerPrompt;
