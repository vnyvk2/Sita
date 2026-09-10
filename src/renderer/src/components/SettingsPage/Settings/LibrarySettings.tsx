import Button from '@renderer/components/Button';
import { settingsQuery } from '@renderer/queries/settings';
import { queryClient } from '@renderer/queryClient';
import calculateElapsedTime from '@renderer/utils/calculateElapsedTime';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CollapsibleSettingsSection from './CollapsibleSettingsSection';

const LibrarySettings = () => {
  const { t } = useTranslation();
  const { data: userSettings } = useQuery(settingsQuery.all);

  const [scanStatus, setScanStatus] = useState<string>('IDLE');
  const [discoveredFiles, setDiscoveredFiles] = useState<number>(0);
  const [reconcileProgress, setReconcileProgress] = useState<{
    completed: number;
    total: number;
  }>({ completed: 0, total: 0 });

  const currentMode = userSettings?.libraryScanMode || 'automatic';

  const { mutate: updateScanMode, isPending: isUpdatingMode } = useMutation({
    mutationFn: (mode: LibraryScanMode) => window.api.settings.updateLibraryScanMode(mode),
    onSettled: () => {
      queryClient.invalidateQueries(settingsQuery.all);
    }
  });

  const libraryApi = window.api?.library ?? window.api?.audioLibraryControls;

  const { mutate: startScan, isPending: isStartingScan } = useMutation({
    mutationFn: async () => libraryApi?.startScan(),
    onSettled: () => {
      queryClient.invalidateQueries(settingsQuery.all);
    }
  });

  const { mutate: cancelScan, isPending: isCancellingScan } = useMutation({
    mutationFn: async () => libraryApi?.cancelScan(),
    onSettled: () => {
      queryClient.invalidateQueries(settingsQuery.all);
    }
  });

  useEffect(() => {
    // Check initial scanner status
    if (libraryApi?.getScanStatus) {
      libraryApi
        .getScanStatus()
        .then((status) => {
          setScanStatus(status);
          return undefined;
        })
        .catch((error) => console.error(error));
    }

    // Listen to live scan progress
    if (libraryApi?.onScanProgress) {
      const removeListener = libraryApi.onScanProgress((...args: unknown[]) => {
        const progress = (args.length > 1 ? args[1] : args[0]) as
          | {
              state?: string;
              discoveredFiles?: number;
              completedReconciliation?: number;
              totalToReconcile?: number;
            }
          | undefined;

        if (progress?.state) {
          setScanStatus(progress.state);
        }
        if (typeof progress?.discoveredFiles === 'number') {
          setDiscoveredFiles(progress.discoveredFiles);
        }
        if (
          typeof progress?.completedReconciliation === 'number' &&
          typeof progress?.totalToReconcile === 'number'
        ) {
          setReconcileProgress({
            completed: progress.completedReconciliation,
            total: progress.totalToReconcile
          });
        }
      });

      return () => {
        if (typeof removeListener === 'function') {
          removeListener();
        }
      };
    }

    return undefined;
  }, [libraryApi]);

  const isScanning =
    scanStatus === 'DISCOVERING' ||
    scanStatus === 'DIFFING' ||
    scanStatus === 'RECONCILING' ||
    isStartingScan;

  const lastScanText = useMemo(() => {
    if (!userSettings?.lastScanTime) {
      return t('settingsPage.lastScanNever', { defaultValue: 'Last scan: Never' });
    }

    try {
      const scanDate = new Date(userSettings.lastScanTime);
      const elapsed = calculateElapsedTime(scanDate.getTime());
      if (elapsed?.elapsedString) {
        return t('settingsPage.lastScan', {
          time: elapsed.elapsedString,
          defaultValue: `Last scan: ${elapsed.elapsedString}`
        });
      }
    } catch {
      // Fallback if parsing fails
    }

    return t('settingsPage.lastScanNever', { defaultValue: 'Last scan: Never' });
  }, [t, userSettings?.lastScanTime]);

  return (
    <CollapsibleSettingsSection
      id="library-scanning-settings-container"
      sectionKey="library"
      title={t('settingsPage.libraryScanning', { defaultValue: 'Library Scanning' })}
      iconName="sync_saved_locally"
      className="library-scanning-settings-container"
    >
      <p className="description mb-6">
        {t('settingsPage.libraryScanningDescription', {
          defaultValue: 'Configure when Nora scans and synchronizes your music library.'
        })}
      </p>

      {/* Scanning Behavior Policy Selection */}
      <div className="policy-section mb-6 max-w-3xl pl-4">
        <div className="text-font-color-highlight dark:text-dark-font-color-highlight mb-3 text-xs font-semibold tracking-wider uppercase">
          {t('settingsPage.scanBehavior', { defaultValue: 'Scanning Behavior' })}
        </div>
        <div className="flex flex-col gap-3">
          {/* Automatic */}
          <label
            htmlFor="scanModeAutomatic"
            aria-label={t('settingsPage.scanAutomatically', { defaultValue: 'Automatically' })}
            className={`bg-background-color-2/75 hover:bg-background-color-2 dark:bg-dark-background-color-2/75 dark:hover:bg-dark-background-color-2 flex cursor-pointer items-start rounded-lg p-4 transition-all focus-within:outline-2 ${
              currentMode === 'automatic'
                ? 'bg-background-color-3! dark:bg-dark-background-color-3! border-font-color-highlight/50 border'
                : 'border border-transparent'
            }`}
          >
            <input
              type="radio"
              name="libraryScanMode"
              id="scanModeAutomatic"
              value="automatic"
              checked={currentMode === 'automatic'}
              disabled={isUpdatingMode}
              onChange={() => updateScanMode('automatic')}
              className="text-font-color-highlight mt-1 mr-4 cursor-pointer"
            />
            <div className="flex flex-col">
              <span className="text-font-color-black dark:text-font-color-white text-base font-medium">
                {t('settingsPage.scanAutomatically', { defaultValue: 'Automatically' })}
              </span>
              <span className="text-sm font-thin opacity-80">
                {t('settingsPage.scanAutomaticallyDescription', {
                  defaultValue: 'Keep your library synchronized in the background.'
                })}
              </span>
            </div>
          </label>

          {/* Startup */}
          <label
            htmlFor="scanModeStartup"
            aria-label={t('settingsPage.scanOnStartup', { defaultValue: 'When Nora starts' })}
            className={`bg-background-color-2/75 hover:bg-background-color-2 dark:bg-dark-background-color-2/75 dark:hover:bg-dark-background-color-2 flex cursor-pointer items-start rounded-lg p-4 transition-all focus-within:outline-2 ${
              currentMode === 'startup'
                ? 'bg-background-color-3! dark:bg-dark-background-color-3! border-font-color-highlight/50 border'
                : 'border border-transparent'
            }`}
          >
            <input
              type="radio"
              name="libraryScanMode"
              id="scanModeStartup"
              value="startup"
              checked={currentMode === 'startup'}
              disabled={isUpdatingMode}
              onChange={() => updateScanMode('startup')}
              className="text-font-color-highlight mt-1 mr-4 cursor-pointer"
            />
            <div className="flex flex-col">
              <span className="text-font-color-black dark:text-font-color-white text-base font-medium">
                {t('settingsPage.scanOnStartup', { defaultValue: 'When Nora starts' })}
              </span>
              <span className="text-sm font-thin opacity-80">
                {t('settingsPage.scanOnStartupDescription', {
                  defaultValue: 'Check for changes whenever Nora starts.'
                })}
              </span>
            </div>
          </label>

          {/* Manual */}
          <label
            htmlFor="scanModeManual"
            aria-label={t('settingsPage.scanManually', { defaultValue: 'Manually' })}
            className={`bg-background-color-2/75 hover:bg-background-color-2 dark:bg-dark-background-color-2/75 dark:hover:bg-dark-background-color-2 flex cursor-pointer items-start rounded-lg p-4 transition-all focus-within:outline-2 ${
              currentMode === 'manual'
                ? 'bg-background-color-3! dark:bg-dark-background-color-3! border-font-color-highlight/50 border'
                : 'border border-transparent'
            }`}
          >
            <input
              type="radio"
              name="libraryScanMode"
              id="scanModeManual"
              value="manual"
              checked={currentMode === 'manual'}
              disabled={isUpdatingMode}
              onChange={() => updateScanMode('manual')}
              className="text-font-color-highlight mt-1 mr-4 cursor-pointer"
            />
            <div className="flex flex-col">
              <span className="text-font-color-black dark:text-font-color-white text-base font-medium">
                {t('settingsPage.scanManually', { defaultValue: 'Manually' })}
              </span>
              <span className="text-sm font-thin opacity-80">
                {t('settingsPage.scanManuallyDescription', {
                  defaultValue: 'Only scan when you choose "Scan Now".'
                })}
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Library Status Card */}
      <div className="status-section max-w-3xl pl-4">
        <div className="text-font-color-highlight dark:text-dark-font-color-highlight mb-3 text-xs font-semibold tracking-wider uppercase">
          {t('settingsPage.libraryStatus', { defaultValue: 'Library Status' })}
        </div>
        <div className="bg-background-color-2/60 dark:bg-dark-background-color-2/60 flex flex-wrap items-center justify-between gap-4 rounded-lg p-5">
          <div className="flex items-center gap-4">
            {isScanning ? (
              <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight animate-spin text-3xl">
                sync
              </span>
            ) : scanStatus === 'FAILED' ? (
              <span className="material-icons-round text-3xl text-red-500">error</span>
            ) : !userSettings?.lastScanTime && scanStatus !== 'COMPLETED' ? (
              <span className="material-icons-round text-3xl text-amber-500">info</span>
            ) : (
              <span className="material-icons-round text-3xl text-emerald-500">check_circle</span>
            )}
            <div className="flex flex-col">
              <span className="text-font-color-black dark:text-font-color-white text-base font-semibold">
                {isScanning
                  ? t('settingsPage.scanningLibrary', { defaultValue: 'Updating library...' })
                  : scanStatus === 'FAILED'
                    ? 'Last scan encountered errors'
                    : !userSettings?.lastScanTime && scanStatus !== 'COMPLETED'
                      ? t('settingsPage.libraryNotScannedYet', { defaultValue: 'Not scanned yet' })
                      : t('settingsPage.libraryUpToDate', { defaultValue: 'Up to date' })}
              </span>
              <span className="text-xs font-thin opacity-75">
                {isScanning
                  ? scanStatus === 'RECONCILING' && reconcileProgress.total > 0
                    ? `Reconciling files (${reconcileProgress.completed}/${reconcileProgress.total})...`
                    : `Discovered ${discoveredFiles} files...`
                  : !userSettings?.lastScanTime && scanStatus !== 'COMPLETED'
                    ? t('settingsPage.libraryNotScannedYetDescription', {
                        defaultValue: 'Run your first scan to synchronize your library.'
                      })
                    : lastScanText}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isScanning ? (
              <Button
                tooltipLabel={t('settingsPage.cancelScan', { defaultValue: 'Cancel' })}
                labelContent={t('settingsPage.cancelScan', { defaultValue: 'Cancel' })}
                iconName="close"
                isDisabled={isCancellingScan}
                clickHandler={() => cancelScan()}
                className="cancel-scan-btn bg-background-color-2 hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3 text-sm"
              />
            ) : (
              <Button
                tooltipLabel={t('settingsPage.scanNow', { defaultValue: 'Scan Now' })}
                labelContent={t('settingsPage.scanNow', { defaultValue: 'Scan Now' })}
                iconName="sync"
                isDisabled={isStartingScan}
                clickHandler={() => startScan()}
                className="scan-now-btn bg-background-color-2 hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3 text-sm"
              />
            )}
          </div>
        </div>
      </div>
    </CollapsibleSettingsSection>
  );
};

export default LibrarySettings;
