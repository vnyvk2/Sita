import { settingsQuery } from '@renderer/queries/settings';
import { spotifyQuery } from '@renderer/queries/spotify';
import { queryClient } from '@renderer/queryClient';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import LastFMIcon from '../../../assets/images/webp/last-fm-logo.webp';
import Button from '../../Button';
import Checkbox from '../../Checkbox';

const AccountsSettings = () => {
  const { data: userSettings } = useQuery(settingsQuery.all);
  const { data: spotifyStatus, isLoading: isSpotifyStatusLoading } = useQuery(spotifyQuery.status);
  const isSpotifyConnected = !!spotifyStatus?.isConnected;

  const { data: spotifyPlaylists, isLoading: isPlaylistsLoading } = useQuery({
    ...spotifyQuery.playlists,
    enabled: isSpotifyConnected
  });

  const [isConnectingSpotify, setIsConnectingSpotify] = useState(false);
  const { t } = useTranslation();

  const isLastFmConnected = useMemo(
    () => !!userSettings?.lastFmSessionKey,
    [userSettings?.lastFmSessionKey]
  );

  const { mutate: updateDiscordRpcState } = useMutation({
    mutationFn: (enableDiscordRpc: boolean) =>
      window.api.settings.updateDiscordRpcState(enableDiscordRpc),
    onSettled: () => {
      queryClient.invalidateQueries(settingsQuery.all);
    }
  });

  const { mutate: updateSongScrobblingToLastFMState } = useMutation({
    mutationFn: (enableScrobbling: boolean) =>
      window.api.settings.updateSongScrobblingToLastFMState(enableScrobbling),
    onSettled: () => {
      queryClient.invalidateQueries(settingsQuery.all);
    }
  });

  const { mutate: updateSongFavoritesToLastFMState } = useMutation({
    mutationFn: (enableFavorites: boolean) =>
      window.api.settings.updateSongFavoritesToLastFMState(enableFavorites),
    onSettled: () => {
      queryClient.invalidateQueries(settingsQuery.all);
    }
  });

  const { mutate: updateSendNowPlayingSongDataToLastFMState } = useMutation({
    mutationFn: (enableNowPlaying: boolean) =>
      window.api.settings.updateNowPlayingSongDataToLastFMState(enableNowPlaying),
    onSettled: () => {
      queryClient.invalidateQueries(settingsQuery.all);
    }
  });

  const { mutate: connectSpotify } = useMutation({
    mutationFn: async () => {
      setIsConnectingSpotify(true);
      return await window.api.spotify.connect();
    },
    onSettled: () => {
      setIsConnectingSpotify(false);
      queryClient.invalidateQueries(spotifyQuery.status);
      queryClient.invalidateQueries(spotifyQuery.playlists);
    }
  });

  const { mutate: disconnectSpotify, isPending: isDisconnectingSpotify } = useMutation({
    mutationFn: () => window.api.spotify.disconnect(),
    onSettled: () => {
      queryClient.invalidateQueries(spotifyQuery.status);
      queryClient.invalidateQueries(spotifyQuery.playlists);
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
                    <ul className="text-font-color-dim dark:text-dark-font-color-dim mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                      {spotifyPlaylists.items.slice(0, 10).map((pl) => (
                        <li
                          key={pl.id}
                          className="border-background-color-3/20 flex items-center justify-between border-b py-1"
                        >
                          <span className="text-font-color-black dark:text-font-color-white font-medium">
                            {pl.name}
                          </span>
                          <span>{pl.tracksTotal} tracks</span>
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

        {/* LastFM Integration */}
        <li className="last-fm-integration mb-4">
          <div className="description">{t('settingsPage.integrateLastFm')}</div>
          <div className="flex p-4 pb-0">
            <img
              src={LastFMIcon}
              alt={t('settingsPage.lastFmLogo')}
              className={`mr-4 h-16 w-16 rounded-md ${
                !isLastFmConnected && 'brightness-90 grayscale'
              }`}
            />
            <div className="grow-0">
              <p
                className={`flex items-center font-semibold uppercase ${
                  isLastFmConnected ? 'text-green-500' : 'text-red-500'
                } `}
              >
                {t(
                  isLastFmConnected
                    ? 'settingsPage.lastFmConnected'
                    : 'settingsPage.lastFmNotConnected'
                )}{' '}
                {isLastFmConnected &&
                  userSettings?.lastFmSessionName &&
                  `(${t('settingsPage.loggedInAs')} ${userSettings.lastFmSessionName})`}
              </p>
              <ul className="list-inside list-disc text-sm">
                <li>{t('settingsPage.lastFmDescription1')}</li>
                <li>{t('settingsPage.lastFmDescription2')}</li>
                <li>{t('settingsPage.lastFmDescription3')}</li>
                <li>{t('settingsPage.lastFmDescription4')}</li>
              </ul>
              <Button
                label={
                  isLastFmConnected
                    ? t('settingsPage.authenticateAgain')
                    : t('settingsPage.loginInBrowser')
                }
                iconName="open_in_new"
                className="mt-2"
                clickHandler={() => window.api.settingsHelpers.loginToLastFmInBrowser()}
              />
            </div>
          </div>
          <ul className="marker:bg-background-color-3 dark:marker:bg-background-color-3 mt-4 list-disc pl-8">
            <li
              className={`last-fm-integration mb-4 transition-opacity ${
                !isLastFmConnected && 'cursor-not-allowed opacity-50'
              }`}
            >
              <div className="description">{t('settingsPage.scrobblingDescription')}</div>
              <Checkbox
                id="sendSongScrobblingDataToLastFM"
                isChecked={!!userSettings?.sendSongScrobblingDataToLastFM}
                checkedStateUpdateFunction={(state) => updateSongScrobblingToLastFMState(state)}
                labelContent={t('settingsPage.enableScrobbling')}
                isDisabled={!isLastFmConnected}
              />
            </li>
            <li
              className={`last-fm-integration mb-4 transition-opacity ${
                !isLastFmConnected && 'cursor-not-allowed opacity-50'
              }`}
            >
              <div className="description">
                {t('settingsPage.sendFavoritesToLastFmDescription')}
              </div>
              <Checkbox
                id="sendSongFavoritesDataToLastFM"
                isChecked={!!userSettings?.sendSongFavoritesDataToLastFM}
                checkedStateUpdateFunction={(state) => updateSongFavoritesToLastFMState(state)}
                labelContent={t('settingsPage.sendFavoritesToLastFm')}
                isDisabled={!isLastFmConnected}
              />
            </li>
            <li
              className={`last-fm-integration mb-4 transition-opacity ${
                !isLastFmConnected && 'cursor-not-allowed opacity-50'
              }`}
            >
              <div className="description">
                {t('settingsPage.sendNowPlayingToLastFmDescription')}
              </div>
              <Checkbox
                id="sendNowPlayingSongDataToLastFM"
                isChecked={!!userSettings?.sendNowPlayingSongDataToLastFM}
                checkedStateUpdateFunction={(state) =>
                  updateSendNowPlayingSongDataToLastFMState(state)
                }
                labelContent={t('settingsPage.sendNowPlayingToLastFm')}
                isDisabled={!isLastFmConnected}
              />
            </li>
          </ul>
        </li>
      </ul>
    </li>
  );
};

export default AccountsSettings;
