import { useCallback, useEffect, useRef } from 'react';
import { lazy } from 'react';

import { releaseNotes, version } from '../../../../package.json';
import { store } from '../store/store';
import isLatestVersion from '../utils/isLatestVersion';
import storage from '../utils/localStorage';
import log from '../utils/log';
import { parseChangelog } from '../utils/parseChangelog';

const ReleaseNotesPrompt = lazy(
  () => import('../components/ReleaseNotesPrompt/ReleaseNotesPrompt')
);

/** Dependencies required by the useAppUpdates hook. */
export interface AppUpdatesDependencies {
  /** Function to show/hide prompt menu with content */
  changePromptMenuData: (
    isVisible?: boolean,
    prompt?: React.ReactNode | null,
    className?: string
  ) => void;
  /** Whether the app is currently online */
  isOnline: boolean;
  /**
   * When false, all update checking is halted: the startup check timeout and the periodic remote
   * changelog polling interval are cleared, and no release-notes prompts can appear. Used to gate
   * update activity in presentation modes that must stay passive (e.g. the mini player).
   */
  isEnabled?: boolean;
}

/**
 * Custom hook to manage application update checking and notifications.
 *
 * This hook:
 *
 * - Checks for app updates on startup (after 5 seconds)
 * - Periodically checks for updates (every 15 minutes)
 * - Fetches latest version info from remote changelog
 * - Compares local version with remote version
 * - Shows release notes prompt when update is available
 * - Respects user preference to skip update notifications
 * - Updates app update state in the store
 * - Handles network errors gracefully
 *
 * Update states:
 *
 * - CHECKING: Currently checking for updates
 * - LATEST: App is up-to-date
 * - OLD: Update available
 * - ERROR: Failed to check for updates
 * - NO_NETWORK_CONNECTION: No internet connection
 *
 * @example
 *   ```tsx
 *   function App() {
 *     const { updateAppUpdatesState, checkForAppUpdates } = useAppUpdates({
 *       changePromptMenuData,
 *       isOnline
 *     });
 *
 *     // Manually trigger update check
 *     checkForAppUpdates();
 *   }
 *   ```;
 *
 * @param dependencies - Object containing required callback functions and state
 * @returns Object with update management functions
 */
export function useAppUpdates(dependencies: AppUpdatesDependencies) {
  const { changePromptMenuData, isOnline, isEnabled = true } = dependencies;

  /**
   * Tracks whether the one-time post-startup changelog check has been scheduled. Without this,
   * every transition back to normal mode re-arms the 5s startup timer and spams the remote
   * changelog with duplicate requests during rapid mini/normal toggling.
   */
  const hasScheduledStartupCheckRef = useRef(false);

  /**
   * Updates the app update state in the store.
   *
   * @param state - The new app update state
   */
  const updateAppUpdatesState = useCallback((state: AppUpdatesState) => {
    store.setState((prevData) => {
      return {
        ...prevData,
        appUpdatesState: state
      };
    });
  }, []);

  /**
   * Checks for application updates by fetching the remote changelog.
   *
   * Process: 1. Checks if online 2. Fetches remote changelog JSON 3. Compares versions 4. Updates
   * app state 5. Shows release notes if update available and not ignored
   */
  const checkForAppUpdates = useCallback(() => {
    if (navigator.onLine) {
      updateAppUpdatesState('CHECKING');

      fetch(releaseNotes.md)
        .then((res) => {
          if (res.status === 200) return res.text();
          throw new Error('response status is not 200');
        })
        .then((resText) => {
          const res = parseChangelog(resText);
          const isThereAnAppUpdate = !isLatestVersion(res.latestVersion.version, version);

          updateAppUpdatesState(isThereAnAppUpdate ? 'OLD' : 'LATEST');

          if (isThereAnAppUpdate) {
            // Check if user has chosen to skip notification for this version
            const noUpdateNotificationForNewUpdate = storage.preferences.getPreferences(
              'noUpdateNotificationForNewUpdate'
            );
            const isUpdateIgnored = noUpdateNotificationForNewUpdate !== res.latestVersion.version;

            log('client has new updates', {
              isThereAnAppUpdate,
              noUpdateNotificationForNewUpdate,
              isUpdateIgnored
            });

            // Show release notes prompt if update not ignored
            if (isUpdateIgnored) {
              changePromptMenuData(true, <ReleaseNotesPrompt />, 'release-notes px-8 py-4');
            }
          } else {
            console.log('client is up-to-date.');
          }

          return undefined;
        })
        .catch((err) => {
          console.error(err);
          return updateAppUpdatesState('ERROR');
        });
    } else {
      updateAppUpdatesState('NO_NETWORK_CONNECTION');
      console.log(`couldn't check for app updates. Check the network connection.`);
    }
  }, [changePromptMenuData, updateAppUpdatesState]);

  useEffect(
    () => {
      // When disabled (e.g. mini player mode), schedule nothing so no remote changelog polling
      // happens and no release-notes modal can be generated over passive presentation modes.
      if (!isEnabled) return undefined;

      // Check for app updates once shortly after startup. Re-enabling after a mini player round
      // trip resumes periodic polling but must NOT repeat the startup check.
      const timeoutId = hasScheduledStartupCheckRef.current
        ? undefined
        : setTimeout(() => {
            hasScheduledStartupCheckRef.current = true;
            checkForAppUpdates();
          }, 5000);

      // Check for app updates every 15 minutes
      const intervalId = setInterval(checkForAppUpdates, 1000 * 60 * 15);

      return () => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        clearInterval(intervalId);
      };
    },
    // Re-run when online status or enabled state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOnline, isEnabled]
  );

  return {
    updateAppUpdatesState,
    checkForAppUpdates
  };
}
