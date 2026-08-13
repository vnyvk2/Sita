import { useMemo } from 'react';
import { useStore } from '@tanstack/react-store';
import { useQuery } from '@tanstack/react-query';
import { settingsQuery } from '../queries/settings';
import { store } from '../store/store';
import { resolveEffectiveAppearance } from '../utils/resolveEffectiveAppearance';

export function useEffectiveAppearance() {
  const themePreset = useStore(
    store,
    (state) => state.localStorage.preferences?.themePreset ?? 'default'
  );

  const { data: userSettings } = useQuery(settingsQuery.all);
  const userAppearance = userSettings?.isDarkMode ?? false;

  return useMemo(() => {
    return resolveEffectiveAppearance({
      themePreset,
      userAppearance
    });
  }, [themePreset, userAppearance]);
}
