import { lazy, useContext, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import rawChangelog from '../../../../../../CHANGELOG.md?raw';
import { version, homepage, urls } from '../../../../../../package.json';
import DiscordLightIcon from '../../../assets/images/svg/discord_dark_mode.svg';
import DiscordDarkIcon from '../../../assets/images/svg/discord_light_mode.svg';
import GithubLightIcon from '../../../assets/images/svg/github-white.svg';
import GithubDarkIcon from '../../../assets/images/svg/github.svg';
import AppIcon from '../../../assets/images/webp/logo_light_mode.webp';
import { AppUpdateContext } from '../../../contexts/AppUpdateContext';
import { useEffectiveAppearance } from '../../../hooks/useEffectiveAppearance';
import calculateElapsedTime from '../../../utils/calculateElapsedTime';
import storage from '../../../utils/localStorage';
import { parseChangelog } from '../../../utils/parseChangelog';
import Button from '../../Button';
import Hyperlink from '../../Hyperlink';
import Img from '../../Img';
import AppStats from './AppStats';

const ReleaseNotesPrompt = lazy(() => import('../../ReleaseNotesPrompt/ReleaseNotesPrompt'));
const ResetAppConfirmationPrompt = lazy(() => import('../ResetAppConfirmationPrompt'));
const SensitiveActionConfirmPrompt = lazy(() => import('../../SensitiveActionConfirmPrompt'));
const AppShortcutsPrompt = lazy(() => import('../AppShortcutsPrompt'));
const ClearLocalStoragePrompt = lazy(() => import('../ClearLocalStoragePrompt'));
const OpenLinkConfirmPrompt = lazy(() => import('../../OpenLinkConfirmPrompt'));

const AboutSettings = () => {
  const { isDark: isDarkMode } = useEffectiveAppearance();
  const { changePromptMenuData, addNewNotifications } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const currentVersionReleasedDate = useMemo(() => {
    const { versions } = parseChangelog(rawChangelog);

    for (let i = 0; i < versions.length; i += 1) {
      if (versions[i].version === version) {
        return versions[i].releaseDate;
      }
    }
    return undefined;
  }, []);

  const elapsed = useMemo(() => {
    if (currentVersionReleasedDate) {
      return calculateElapsedTime(currentVersionReleasedDate);
    }
    return undefined;
  }, [currentVersionReleasedDate]);

  return (
    <li className="main-container about-container" id="about-settings-container">
      <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-4 flex items-center text-2xl font-medium">
        <span className="material-icons-round-outlined mr-2">info</span>
        About
      </div>
      <div className="pl-2">
        <div className="mb-2 flex items-center justify-between p-2 text-lg">
          <div className="flex items-center">
            <Img src={AppIcon} className="aspect-square max-h-12 rounded-md shadow-md" alt="" />
            <div className="ml-4 flex flex-col">
              <span className="block">Sita</span>
              <span className="text-sm font-light">
                v{version}{' '}
                {elapsed && (
                  <>
                    &bull;{' '}
                    <span
                      title={
                        currentVersionReleasedDate
                          ? t('settingsPage.releasedOn', {
                              val: new Date(currentVersionReleasedDate),
                              formatParams: {
                                val: {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                }
                              }
                            })
                          : undefined
                      }
                    >
                      ({elapsed.elapsedString})
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-6">
            <Button
              className="about-link mr-0! block w-fit cursor-pointer rounded-none! border-0! bg-transparent p-0! leading-[0] opacity-70 outline-offset-2 transition-opacity hover:bg-transparent hover:opacity-100 focus-visible:outline! dark:bg-transparent dark:hover:bg-transparent"
              iconName="language"
              iconClassName="text-2xl! leading-none!"
              tooltipLabel={t('settingsPage.noraWebsite')}
              clickHandler={() =>
                changePromptMenuData(
                  true,
                  <OpenLinkConfirmPrompt
                    link={urls.website_url}
                    title={t('settingsPage.noraWebsite')}
                  />,
                  'flex flex-col'
                )
              }
            />
            <Img
              src={isDarkMode ? DiscordLightIcon : DiscordDarkIcon}
              className="w-6 cursor-pointer opacity-70! transition-opacity! hover:opacity-100!"
              alt={t('settingsPage.noraDiscordServer')}
              showAltAsTooltipLabel
              onClick={() =>
                changePromptMenuData(
                  true,
                  <OpenLinkConfirmPrompt
                    link={urls.discord_invite_url}
                    title={t('settingsPage.noraDiscordServer')}
                  />,
                  'flex flex-col'
                )
              }
              tabIndex={0}
            />
            <Img
              src={isDarkMode ? GithubLightIcon : GithubDarkIcon}
              className="w-6 cursor-pointer opacity-70! transition-opacity! hover:opacity-100!"
              alt={t('settingsPage.noraGithubRepo')}
              showAltAsTooltipLabel
              onClick={() =>
                changePromptMenuData(
                  true,
                  <OpenLinkConfirmPrompt
                    link={homepage}
                    title={t('settingsPage.noraGithubRepo')}
                  />,
                  'flex flex-col'
                )
              }
              tabIndex={0}
            />
          </div>
        </div>
        <div className="mb-4 flex items-center gap-4">
          <img
            alt="GitHub all releases"
            src="https://img.shields.io/github/downloads/Sandakan/Nora/total?label=all%20time%20downloads"
          />
          <img
            alt="GitHub release (latest by date)"
            src={`https://img.shields.io/github/downloads/Sandakan/Nora/v${version}/total`}
          />
          <Hyperlink
            linkTitle={t('settingsPage.noraGithubIssues')}
            link="https://github.com/Sandakan/Nora/issues"
          >
            <img
              alt="GitHub issues"
              src="https://img.shields.io/github/issues/Sandakan/Oto-Music-for-Desktop"
            />
          </Hyperlink>

          <Hyperlink
            linkTitle={t('settingsPage.noraLocalizationStatus')}
            link="https://crowdin.com/project/nora"
          >
            <img
              src="https://badges.crowdin.net/nora/localized.svg"
              alt={t('settingsPage.noraLocalizationStatus')}
            />
          </Hyperlink>
        </div>
        <ul className="mb-4 list-disc pl-4 text-sm">
          <li>{t('settingsPage.noraDescription')}</li>
          <li>
            <Trans
              i18nKey="settingsPage.noraInspiration"
              components={{
                Hyperlink: (
                  <Hyperlink
                    linkTitle={t('settingsPage.musicBeeWebsite', {
                      defaultValue: 'MusicBee website'
                    })}
                    link="https://getmusicbee.com/"
                  />
                )
              }}
            />
          </li>
        </ul>
        <div className="mt-12 flex flex-wrap items-center justify-center px-8">
          <Button
            iconName="new_releases"
            iconClassName="material-icons-round-outlined"
            className="release-notes-prompt-btn mb-4"
            label={t('settingsPage.releaseNotes')}
            clickHandler={() =>
              changePromptMenuData(true, <ReleaseNotesPrompt />, 'release-notes px-8 py-4')
            }
          />
          <Button
            iconName="description"
            iconClassName="material-icons-round-outlined"
            className="about-link mb-4"
            label={t('settingsPage.openLogFile')}
            clickHandler={() => window.api.log.openLogFile()}
          />
          <Button
            label={t('settingsPage.openDevtools')}
            iconName="code"
            className="mb-4"
            clickHandler={() => window.api.settingsHelpers.openDevtools()}
          />
          <Button
            label={t('settingsPage.resyncLibrary')}
            iconName="sync"
            className="mb-4"
            clickHandler={() => window.api.audioLibraryControls.resyncSongsLibrary()}
          />
          <Button
            label={t('settingsPage.generatePalettes')}
            iconName="temp_preferences_custom"
            className="mb-4"
            clickHandler={() => window.api.audioLibraryControls.generatePalettes()}
          />
          <Button
            label={t('settingsPage.appShortcuts')}
            iconName="trail_length_short"
            className="mb-4"
            iconClassName="material-icons-round-outlined"
            clickHandler={() => changePromptMenuData(true, <AppShortcutsPrompt />)}
          />
        </div>

        <AppStats />

        <div className="about-buttons-container mb-4 flex flex-wrap justify-center">
          <Button
            label={t('settingsPage.resetApp')}
            iconName="auto_mode"
            className="mb-4"
            clickHandler={() =>
              changePromptMenuData(true, <ResetAppConfirmationPrompt />, 'confirm-app-reset')
            }
          />
          <Button
            label={t('settingsPage.clearOptionalData')}
            iconName="delete"
            className="mb-4"
            iconClassName="material-icons-round-outlined"
            clickHandler={() =>
              changePromptMenuData(true, <ClearLocalStoragePrompt />, 'confirm-app-reset')
            }
          />

          <Button
            label={t('settingsPage.clearHistory')}
            iconName="clear"
            className="mb-4"
            clickHandler={() => {
              changePromptMenuData(
                true,
                <SensitiveActionConfirmPrompt
                  title={t('settingsPage.confirmSongHistoryDeletion')}
                  content={<div>{t('settingsPage.songHistoryDeletionDisclaimer')}</div>}
                  confirmButton={{
                    label: t('settingsPage.clearHistory'),
                    clickHandler: () => {
                      window.api.audioLibraryControls
                        .clearSongHistory()
                        .then((res) => {
                          if (res.success) {
                            addNewNotifications([
                              {
                                id: 'songHistoryCleared',
                                duration: 5000,
                                content: <span>{t('settingsPage.songHistoryDeletionSuccess')}</span>
                              }
                            ]);
                          }
                          return changePromptMenuData(false);
                        })
                        .catch((err) => console.error(err));
                    }
                  }}
                />
              );
            }}
          />

          <Button
            label={t('settingsPage.exportAppData')}
            iconName="file_upload"
            className="mb-4"
            clickHandler={(_, setIsDisabled, setIsPending) => {
              setIsDisabled(true);
              setIsPending(true);

              return window.api.settingsHelpers
                .exportAppData(JSON.stringify(storage.getAllItems()))
                .finally(() => {
                  setIsDisabled(false);
                  setIsPending(false);
                })
                .catch((err) => console.error(err));
            }}
          />

          <Button
            label={t('settingsPage.importAppData')}
            iconName="publish"
            className="mr-0! mb-4"
            clickHandler={(_, setIsDisabled, setIsPending) => {
              setIsDisabled(true);
              setIsPending(true);

              return window.api.settingsHelpers
                .importAppData()
                .then((res) => {
                  if (res) storage.setAllItems(res);
                  return undefined;
                })
                .finally(() => {
                  setIsDisabled(false);
                  setIsPending(false);
                })
                .catch((err) => console.error(err));
            }}
          />
        </div>
      </div>
    </li>
  );
};

export default AboutSettings;
