import { settingsQuery } from '@renderer/queries/settings';
import { spotifyQuery } from '@renderer/queries/spotify';
import { queryClient } from '@renderer/queryClient';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SpotifyPlaylistSummary } from '../../../../../main/spotify/api/types';
import LastFMIcon from '../../../assets/images/webp/last-fm-logo.webp';
import Button from '../../Button';
import Checkbox from '../../Checkbox';
import { SpotifyPlaylistImportModal } from './SpotifyPlaylistImportModal';

const AccountsSettings = () => {
  const { data: userSettings } = useQuery(settingsQuery.all);
  const { data: spotifyStatus, isLoading: isSpotifyStatusLoading } = useQuery(spotifyQuery.status);
  const isSpotifyConnected = !!spotifyStatus?.isConnected;

  const { data: spotifyPlaylists, isLoading: isPlaylistsLoading } = useQuery({
    ...spotifyQuery.playlists,
    enabled: isSpotifyConnected
  });

  const [isConnectingSpotify, setIsConnectingSpotify] = useState(false);
  const [selectedPlaylistForImport, setSelectedPlaylistForImport] =
    useState<SpotifyPlaylistSummary | null>(null);
  const { t } = useTranslation();

  const isLastFmConnected = useMemo(
    () => !!userSettings?.lastFmSessionKey,
    [userSettings?.lastFmSessionKey]
  );

  const { mutate: updateDiscordRpcState } = useMutation({
    mutationFn: (state: boolean) => window.api.settings.setUserData('enableDiscordRPC', state),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsQuery.all.queryKey })
  });

  const { mutate: connectSpotify } = useMutation({
    mutationFn: async () => {
      setIsConnectingSpotify(true);
      return await window.api.spotify.connect();
    },
    onSettled: () => {
      setIsConnectingSpotify(false);
      void queryClient.invalidateQueries({ queryKey: spotifyQuery.status.queryKey });
      void queryClient.invalidateQueries({ queryKey: spotifyQuery.playlists.queryKey });
    }
  });

  const { mutate: disconnectSpotify, isPending: isDisconnectingSpotify } = useMutation({
    mutationFn: async () => {
      return await window.api.spotify.disconnect();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: spotifyQuery.status.queryKey });
      void queryClient.invalidateQueries({ queryKey: spotifyQuery.playlists.queryKey });
    }
  });

  const { mutate: disconnectLastFM } = useMutation({
    mutationFn: () => window.api.lastFm.disconnect(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsQuery.all.queryKey });
    }
  });

  return (
    <li
      className="main-container startup-settings-container mb-16"
      id="accounts-settings-container"
    >
      <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-4 flex items-center text-2xl font-medium">
        <span className="material-icons-round-outlined mr-2">account_circle</span>
        {t('settingsPage.accounts')}
      </div>
      <ul className="marker:bg-background-color-3 dark:marker:bg-background-color-3 list-disc pl-6">
        {/* Spotify Integration */}
        <li className="spotify-integration mb-8">
          <div className="description">
            Connect your Spotify account to import and sync playlists.
          </div>
          <div className="flex items-start p-4 pb-0">
            <div className="mr-4 flex h-16 w-16 items-center justify-center rounded-xl bg-[#1DB954]/10 text-[#1DB954]">
              <span className="material-icons-round text-4xl">graphic_eq</span>
            </div>
            <div className="grow">
              <p
                className={`flex items-center font-semibold uppercase ${
                  isSpotifyConnected ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {isSpotifyConnected
                  ? `Connected as ${spotifyStatus?.user?.displayName || spotifyStatus?.user?.spotifyUserId}`
                  : 'Spotify Not Connected'}
              </p>
              <p className="text-font-color-dim dark:text-dark-font-color-dim mt-1 text-sm">
                {isSpotifyConnected
                  ? 'Your Spotify account is connected. Nora can discover and bridge your playlists.'
                  : 'Connect Nora to Spotify using secure OAuth PKCE to browse and bridge playlists.'}
              </p>

              <div className="mt-3 flex items-center gap-3">
                {isSpotifyConnected ? (
                  <Button
                    label={isDisconnectingSpotify ? 'Disconnecting...' : 'Disconnect Spotify'}
                    iconName="link_off"
                    className="border-red-500 text-red-500 hover:bg-red-500/10"
                    clickHandler={() => disconnectSpotify()}
                    isDisabled={isDisconnectingSpotify}
                  />
                ) : (
                  <Button
                    label={isConnectingSpotify ? 'Waiting for Browser...' : 'Connect Spotify'}
                    iconName="open_in_new"
                    className="bg-[#1DB954]! text-white!"
                    clickHandler={() => connectSpotify()}
                    isDisabled={isConnectingSpotify || isSpotifyStatusLoading}
                  />
                )}
              </div>

              {isSpotifyConnected && (
                <div className="bg-background-color-2/50 dark:bg-dark-background-color-2/50 mt-4 rounded-lg p-4">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>Remote Playlists</span>
                    <span className="text-font-color-highlight dark:text-dark-font-color-highlight">
                      {isPlaylistsLoading
                        ? 'Loading playlists...'
                        : `${spotifyPlaylists?.total ?? 0} Playlists found`}
                    </span>
                  </div>
                  {spotifyPlaylists && spotifyPlaylists.items.length > 0 && (
                    <ul className="text-font-color-dim dark:text-dark-font-color-dim mt-2 max-h-48 space-y-1.5 overflow-y-auto text-xs">
                      {spotifyPlaylists.items.slice(0, 10).map((pl) => (
                        <li
                          key={pl.id}
                          className="border-background-color-3/20 flex items-center justify-between border-b py-1.5"
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span className="material-icons-round text-sm text-[#1DB954]">
                              playlist_play
                            </span>
                            <span className="text-font-color-black dark:text-font-color-white truncate font-medium">
                              {pl.name}
                            </span>
                            <span className="text-[11px] opacity-70">({pl.tracksTotal} tracks)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedPlaylistForImport(pl)}
                            className="flex shrink-0 items-center gap-1 rounded bg-[#1DB954]/15 px-2.5 py-1 text-[11px] font-semibold text-[#1DB954] transition hover:bg-[#1DB954]/25"
                          >
                            <span className="material-icons-round text-xs">download</span>
                            Import
                          </button>
                        </li>
                      ))}
                      {spotifyPlaylists.items.length > 10 && (
                        <li className="pt-1 text-center text-xs italic">
                          + {spotifyPlaylists.items.length - 10} more playlists
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              {/* Spotify Playlist Import Modal */}
              <SpotifyPlaylistImportModal
                playlist={selectedPlaylistForImport}
                isOpen={Boolean(selectedPlaylistForImport)}
                onClose={() => setSelectedPlaylistForImport(null)}
              />
            </div>
          </div>
        </li>

        {/* Discord RPC */}
        <li className="discord-rpc-integration mb-4">
          <div className="description">{t('settingsPage.enableDiscordRpcDescription')}</div>
          <Checkbox
            id="enableDiscordRpc"
            isChecked={userSettings?.enableDiscordRPC ?? false}
            checkedStateUpdateFunction={(state) => updateDiscordRpcState(state)}
            labelContent={t('settingsPage.enableDiscordRpc')}
          />
        </li>

        {/* Last.fm Integration */}
        <li className="last-fm-integration mb-4">
          <div className="description">{t('settingsPage.lastFmDescription')}</div>
          <div className="flex items-start p-4 pb-0">
            <div className="mr-4 flex h-16 w-16 items-center justify-center rounded-xl bg-[#ba0000]/10 text-[#ba0000]">
              <img src={LastFMIcon} alt="Last.fm Logo" className="h-10 w-10 object-contain" />
            </div>
            <div className="grow">
              <p
                className={`flex items-center font-semibold uppercase ${
                  isLastFmConnected ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {isLastFmConnected
                  ? `${t('settingsPage.connectedToLastFM')} (${userSettings?.lastFmUsername})`
                  : t('settingsPage.notConnectedToLastFM')}
              </p>
              <p className="text-font-color-dim dark:text-dark-font-color-dim mt-1 text-sm">
                {isLastFmConnected
                  ? t('settingsPage.lastFMConnectedDesc')
                  : t('settingsPage.lastFMDisconnectedDesc')}
              </p>
              <div className="mt-3 flex items-center gap-3">
                {isLastFmConnected ? (
                  <Button
                    label={t('settingsPage.disconnectFromLastFM')}
                    iconName="link_off"
                    className="border-red-500 text-red-500 hover:bg-red-500/10"
                    clickHandler={() => disconnectLastFM()}
                  />
                ) : (
                  <Button
                    label={t('settingsPage.connectToLastFM')}
                    iconName="open_in_new"
                    className="bg-[#ba0000]! text-white!"
                    clickHandler={() => window.api.lastFm.authorize()}
                  />
                )}
              </div>
            </div>
          </div>
        </li>
      </ul>
    </li>
  );
};

export default AccountsSettings;
