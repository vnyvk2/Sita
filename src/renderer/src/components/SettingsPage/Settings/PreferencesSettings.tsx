import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useTranslation } from 'react-i18next';

import storage from '../../../utils/localStorage';
import Checkbox from '../../Checkbox';
import Dropdown, { type DropdownOption } from '../../Dropdown';
import CollapsibleSettingsSection from './CollapsibleSettingsSection';

const alphabetScrubberOptions: DropdownOption<string>[] = [
  { label: 'Off', value: 'off' },
  { label: 'Top (Horizontal)', value: 'top-horizontal' },
  { label: 'Left (Vertical)', value: 'left-vertical' }
];

const PreferencesSettings = () => {
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { t } = useTranslation();

  return (
    <CollapsibleSettingsSection
      id="preferences-settings-container"
      sectionKey="preferences"
      title={t('settingsPage.preferences')}
      iconName="tune"
      className="preferences-settings-container"
      defaultExpanded={true}
    >
      <ul className="marker:bg-background-color-3 dark:marker:bg-background-color-3 list-disc pl-6">
        <li className="checkbox-container">
          <div className="secondary-container toggle-song-indexing mb-4">
            <div className="description">{t('settingsPage.songIndexingDescription')}</div>
            <Checkbox
              id="isSongIndexingEnabled"
              isChecked={preferences?.isSongIndexingEnabled}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('isSongIndexingEnabled', state)
              }
              labelContent={t('settingsPage.enableSongIndexing')}
            />
          </div>
        </li>

        <li className="checkbox-container">
          <div className="secondary-container toggle-song-indexing mb-4">
            <div className="description">
              {t('settingsPage.showTrackNumberAsSongIndexDescription')}
            </div>
            <Checkbox
              id="showTrackNumberAsSongIndex"
              isChecked={preferences?.showTrackNumberAsSongIndex}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('showTrackNumberAsSongIndex', state)
              }
              labelContent={t('settingsPage.showTrackNumberAsSongIndex')}
            />
          </div>
        </li>

        <li className="alphabet-scrubber-settings-container mb-4">
          <div className="secondary-container toggle-alphabet-scrubber mb-4">
            <div className="description">
              {t(
                'settingsPage.alphabetScrubberDescription',
                'Quickly jump to songs starting with a letter using an A–Z navigation bar.'
              )}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-medium">
                {t('settingsPage.alphabetScrubberPosition', 'Alphabet Navigation Bar')}
              </span>
              <Dropdown
                name="alphabetScrubberPosition"
                value={preferences?.alphabetScrubberPosition ?? 'off'}
                options={alphabetScrubberOptions}
                onChange={(e) => {
                  const val = e.currentTarget.value as 'off' | 'top-horizontal' | 'left-vertical';
                  storage.preferences.setPreferences('alphabetScrubberPosition', val);
                }}
              />
            </div>
          </div>
        </li>

        <li className="checkbox-container">
          <div className="secondary-container toggle-show-equalizer mb-4">
            <div className="description">
              {t('settingsPage.showEqualizerOnTracklistDescription')}
            </div>
            <Checkbox
              id="showEqualizerOnTracklist"
              isChecked={preferences?.showEqualizerOnTracklist ?? true}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('showEqualizerOnTracklist', state)
              }
              labelContent={t('settingsPage.showEqualizerOnTracklist')}
            />
          </div>
        </li>

        <li className="checkbox-container">
          <div className="secondary-container show-artists-artwork-near-song-controls mb-4">
            <div className="description">
              {t('settingsPage.showArtistArtworkNearSongControlsDescription')}
            </div>
            <Checkbox
              id="showArtistArtworkNearSongControls"
              isChecked={preferences?.showArtistArtworkNearSongControls}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('showArtistArtworkNearSongControls', state)
              }
              labelContent={t('settingsPage.showArtistArtworkNearSongControls')}
            />
          </div>
        </li>

        <li className="checkbox-container">
          <div className="secondary-container disable-background-artworks mb-4">
            <div className="description">
              {t('settingsPage.disableBackgroundArtworksDescription')}
            </div>
            <Checkbox
              id="disableBackgroundArtwork"
              isChecked={preferences?.disableBackgroundArtworks}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('disableBackgroundArtworks', state)
              }
              labelContent={t('settingsPage.disableBackgroundArtworks')}
            />
          </div>
        </li>

        <li className="checkbox-container">
          <div className="secondary-container toggle-experimental-workspace mb-4">
            <div className="description">
              Enable the modular workspace system for customizable multi-column sidebars, docked
              panels, and MusicBee layouts.
            </div>
            <Checkbox
              id="isExperimentalWorkspaceEnabled"
              isChecked={preferences?.isExperimentalWorkspaceEnabled ?? false}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('isExperimentalWorkspaceEnabled', state)
              }
              labelContent="Enable Modular Workspace System (Experimental)"
            />
          </div>
        </li>

        <li className="checkbox-container">
          <div className="secondary-container enable-artwork-from-song-covers mb-4">
            <div className="description">{t('settingsPage.playlistArtworksDescription')}</div>
            <Checkbox
              id="enableArtworkFromSongCovers"
              className="mb-2"
              isChecked={preferences?.enableArtworkFromSongCovers}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('enableArtworkFromSongCovers', state)
              }
              labelContent={t('settingsPage.enablePlaylistArtworks')}
            />
            <Checkbox
              id="shuffleArtworkFromSongCovers"
              isDisabled={!preferences?.enableArtworkFromSongCovers}
              isChecked={preferences?.shuffleArtworkFromSongCovers}
              checkedStateUpdateFunction={(state) =>
                storage.preferences.setPreferences('shuffleArtworkFromSongCovers', state)
              }
              labelContent={t('settingsPage.shuffleArtworkFromSongCovers')}
            />
          </div>
        </li>

        <li className="checkbox-container">
          <div className="secondary-container toggle-sidebar-navigation mb-4">
            <div className="description">{t('settingsPage.sidebarNavigationDescription')}</div>
            <div className="mt-2 flex flex-col gap-1">
              <Checkbox
                id="toggleSidebarTabGenre"
                isChecked={preferences?.visibleSideTabs?.genres ?? true}
                checkedStateUpdateFunction={(state) => {
                  const current = preferences?.visibleSideTabs ?? {
                    genres: true,
                    folders: true,
                    artists: true,
                    albums: true,
                    insights: true
                  };
                  storage.preferences.setPreferences('visibleSideTabs', {
                    ...current,
                    genres: state
                  });
                }}
                labelContent={t('common.genre_other')}
              />
              <Checkbox
                id="toggleSidebarTabFolders"
                isChecked={preferences?.visibleSideTabs?.folders ?? true}
                checkedStateUpdateFunction={(state) => {
                  const current = preferences?.visibleSideTabs ?? {
                    genres: true,
                    folders: true,
                    artists: true,
                    albums: true,
                    insights: true
                  };
                  storage.preferences.setPreferences('visibleSideTabs', {
                    ...current,
                    folders: state
                  });
                }}
                labelContent={t('common.folder_other')}
              />
              <Checkbox
                id="toggleSidebarTabArtists"
                isChecked={preferences?.visibleSideTabs?.artists ?? true}
                checkedStateUpdateFunction={(state) => {
                  const current = preferences?.visibleSideTabs ?? {
                    genres: true,
                    folders: true,
                    artists: true,
                    albums: true,
                    insights: true
                  };
                  storage.preferences.setPreferences('visibleSideTabs', {
                    ...current,
                    artists: state
                  });
                }}
                labelContent={t('common.artist_other')}
              />
              <Checkbox
                id="toggleSidebarTabAlbums"
                isChecked={preferences?.visibleSideTabs?.albums ?? true}
                checkedStateUpdateFunction={(state) => {
                  const current = preferences?.visibleSideTabs ?? {
                    genres: true,
                    folders: true,
                    artists: true,
                    albums: true,
                    insights: true
                  };
                  storage.preferences.setPreferences('visibleSideTabs', {
                    ...current,
                    albums: state
                  });
                }}
                labelContent={t('common.album_other')}
              />
              <Checkbox
                id="toggleSidebarTabInsights"
                isChecked={preferences?.visibleSideTabs?.insights ?? true}
                checkedStateUpdateFunction={(state) => {
                  const current = preferences?.visibleSideTabs ?? {
                    genres: true,
                    folders: true,
                    artists: true,
                    albums: true,
                    insights: true
                  };
                  storage.preferences.setPreferences('visibleSideTabs', {
                    ...current,
                    insights: state
                  });
                }}
                labelContent={t('sideBar.insights', { defaultValue: 'Insights' })}
              />
            </div>
          </div>
        </li>
      </ul>
    </CollapsibleSettingsSection>
  );
};

export default PreferencesSettings;
