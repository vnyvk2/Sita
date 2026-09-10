/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react';

export const SETTINGS_SECTION_KEYS = [
  'appearance',
  'language',
  'audioPlayback',
  'accounts',
  'lyrics',
  'equalizer',
  'defaultPage',
  'preferences',
  'metadata',
  'accessibility',
  'performance',
  'downloads',
  'library',
  'startup',
  'storage',
  'advanced'
] as const;

export type SettingsSectionKey = (typeof SETTINGS_SECTION_KEYS)[number];

export interface SettingsCollapseContextType {
  isSectionExpanded: (key: SettingsSectionKey) => boolean;
  toggleSection: (key: SettingsSectionKey) => void;
  collapseAll: () => void;
  expandAll: () => void;
  areAllCollapsed: boolean;
}

export const SettingsCollapseContext = createContext<SettingsCollapseContextType | null>(null);

export const useSettingsCollapse = () => useContext(SettingsCollapseContext);

interface SettingsCollapseProviderProps {
  children: ReactNode;
  initialExpanded?: boolean;
}

export const SettingsCollapseProvider = ({
  children,
  initialExpanded = true
}: SettingsCollapseProviderProps) => {
  const [expandedMap, setExpandedMap] = useState<Record<SettingsSectionKey, boolean>>(() => {
    const initial = {} as Record<SettingsSectionKey, boolean>;
    for (const key of SETTINGS_SECTION_KEYS) {
      initial[key] = initialExpanded;
    }
    return initial;
  });

  const isSectionExpanded = useCallback(
    (key: SettingsSectionKey) => expandedMap[key] ?? true,
    [expandedMap]
  );

  const toggleSection = useCallback((key: SettingsSectionKey) => {
    setExpandedMap((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedMap((prev) => {
      const next = {} as Record<SettingsSectionKey, boolean>;
      for (const key of SETTINGS_SECTION_KEYS) {
        next[key] = false;
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedMap((prev) => {
      const next = {} as Record<SettingsSectionKey, boolean>;
      for (const key of SETTINGS_SECTION_KEYS) {
        next[key] = true;
      }
      return next;
    });
  }, []);

  const areAllCollapsed = useMemo(() => {
    return SETTINGS_SECTION_KEYS.every((key) => !expandedMap[key]);
  }, [expandedMap]);

  const value = useMemo(
    () => ({
      isSectionExpanded,
      toggleSection,
      collapseAll,
      expandAll,
      areAllCollapsed
    }),
    [isSectionExpanded, toggleSection, collapseAll, expandAll, areAllCollapsed]
  );

  return (
    <SettingsCollapseContext.Provider value={value}>
      {children}
    </SettingsCollapseContext.Provider>
  );
};
