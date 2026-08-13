import { useMemo } from 'react';
import { useStore } from '@tanstack/react-store';
import { useSuspenseQuery } from '@tanstack/react-query';
import { settingsQuery } from '../components/SettingsPage/Settings/settingsQuery';
import { store } from '../other/store';
import { resolveEffectiveAppearance } from '../utils/resolveEffectiveAppearance';

export function useEffectiveAppearance() {
  const themePreset = useStore(
    store,
    (state) => state.localStorage.preferences?.themePreset ?? 'default'
  );

  const { data: userSettings } = useSuspenseQuery(settingsQuery.all);
  const userAppearance = userSettings.isDarkMode;

  return useMemo(() => {
    return resolveEffectiveAppearance({
      themePreset,
      userAppearance
    });
  }, [themePreset, userAppearance]);
}
