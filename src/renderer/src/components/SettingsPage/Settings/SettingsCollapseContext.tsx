/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  'advanced',
  'about'
] as const;

export type SettingsSectionKey = (typeof SETTINGS_SECTION_KEYS)[number];

export interface SettingsCollapseContextType {
  isSectionExpanded: (key: SettingsSectionKey) => boolean;
  toggleSection: (key: SettingsSectionKey) => void;
  expandSection: (key: SettingsSectionKey) => void;
  collapseAll: () => void;
  expandAll: () => void;
  areAllCollapsed: boolean;
  jumpToSetting: (id: string, sectionKey: SettingsSectionKey) => void;
  highlightedSettingId: string | null;
}

export interface SettingsCollapseActions {
  toggleSection: (key: SettingsSectionKey) => void;
  expandSection: (key: SettingsSectionKey) => void;
  collapseAll: () => void;
  expandAll: () => void;
  jumpToSetting: (id: string, sectionKey: SettingsSectionKey) => void;
}

export const SettingsCollapseActionsContext = createContext<SettingsCollapseActions | null>(null);

export const useSettingsCollapseActions = () => useContext(SettingsCollapseActionsContext);

export const SettingsCollapseContext = createContext<SettingsCollapseContextType | null>(null);

export const useSettingsCollapse = () => useContext(SettingsCollapseContext);

interface SettingsCollapseProviderProps {
  children: ReactNode;
  initialExpanded?: boolean;
}

interface PendingTarget {
  id: string;
  sectionKey: SettingsSectionKey;
  timestamp: number;
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

  const [highlightedSettingId, setHighlightedSettingId] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<PendingTarget | null>(null);
  const cleanupTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const expandSection = useCallback((key: SettingsSectionKey) => {
    setExpandedMap((prev) => {
      if (prev[key]) return prev;
      return {
        ...prev,
        [key]: true
      };
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedMap(() => {
      const next = {} as Record<SettingsSectionKey, boolean>;
      for (const key of SETTINGS_SECTION_KEYS) {
        next[key] = false;
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedMap(() => {
      const next = {} as Record<SettingsSectionKey, boolean>;
      for (const key of SETTINGS_SECTION_KEYS) {
        next[key] = true;
      }
      return next;
    });
  }, []);

  const jumpToSetting = useCallback((id: string, sectionKey: SettingsSectionKey) => {
    // 1. Ensure the parent section is expanded
    setExpandedMap((prev) => {
      if (prev[sectionKey]) return prev;
      return { ...prev, [sectionKey]: true };
    });

    // 2. Queue pending target for post-render double-rAF execution
    setPendingTarget({
      id,
      sectionKey,
      timestamp: Date.now()
    });
  }, []);

  // Post-render double-rAF layout synchronization
  useEffect(() => {
    if (!pendingTarget) return;

    const { id, sectionKey } = pendingTarget;

    // Wait until the section is marked expanded in state
    if (!expandedMap[sectionKey]) return;

    let cancelled = false;

    // Use nested requestAnimationFrame to guarantee React has flushed DOM mutations and layout
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        if (cancelled) return;

        const element = document.getElementById(id);
        if (element) {
          const prefersReducedMotion =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

          if (typeof element.scrollIntoView === 'function') {
            element.scrollIntoView({
              behavior: prefersReducedMotion ? 'auto' : 'smooth',
              block: 'center'
            });
          }

          // Clear spotlight from any previous active elements to prevent class leaks
          document.querySelectorAll('.setting-spotlight-active').forEach((el) => {
            el.classList.remove('setting-spotlight-active');
          });

          // Apply spotlight CSS class
          element.classList.add('setting-spotlight-active');
          setHighlightedSettingId(id);

          if (cleanupTimerRef.current) {
            clearTimeout(cleanupTimerRef.current);
          }

          cleanupTimerRef.current = setTimeout(() => {
            element.classList.remove('setting-spotlight-active');
            setHighlightedSettingId((curr) => (curr === id ? null : curr));
          }, 2200);
        }

        setPendingTarget(null);
      });

      return () => cancelAnimationFrame(raf2);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [pendingTarget, expandedMap]);

  // Cleanup spotlight timer and active classes on unmount
  useEffect(() => {
    return () => {
      if (cleanupTimerRef.current) {
        clearTimeout(cleanupTimerRef.current);
      }
      document.querySelectorAll('.setting-spotlight-active').forEach((el) => {
        el.classList.remove('setting-spotlight-active');
      });
    };
  }, []);

  const areAllCollapsed = useMemo(() => {
    return SETTINGS_SECTION_KEYS.every((key) => !expandedMap[key]);
  }, [expandedMap]);

  const actions = useMemo<SettingsCollapseActions>(
    () => ({
      toggleSection,
      expandSection,
      collapseAll,
      expandAll,
      jumpToSetting
    }),
    [toggleSection, expandSection, collapseAll, expandAll, jumpToSetting]
  );

  const value = useMemo(
    () => ({
      isSectionExpanded,
      toggleSection,
      expandSection,
      collapseAll,
      expandAll,
      areAllCollapsed,
      jumpToSetting,
      highlightedSettingId
    }),
    [
      isSectionExpanded,
      toggleSection,
      expandSection,
      collapseAll,
      expandAll,
      areAllCollapsed,
      jumpToSetting,
      highlightedSettingId
    ]
  );

  return (
    <SettingsCollapseActionsContext.Provider value={actions}>
      <SettingsCollapseContext.Provider value={value}>
        {children}
      </SettingsCollapseContext.Provider>
    </SettingsCollapseActionsContext.Provider>
  );
};
