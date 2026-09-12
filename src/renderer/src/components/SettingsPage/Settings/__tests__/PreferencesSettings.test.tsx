// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '../../../../store/store';
import storage from '../../../../utils/localStorage';
import PreferencesSettings from '../PreferencesSettings';

// Mock storage
vi.mock('../../../../utils/localStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../utils/localStorage')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      checkLocalStorage: vi.fn(),
      preferences: {
        ...actual.default?.preferences,
        setPreferences: vi.fn()
      }
    }
  };
});

// Mock react-i18next preserving initReactI18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key
    })
  };
});

describe('PreferencesSettings Sidebar Tabs Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          visibleSideTabs: {
            genres: true,
            folders: true,
            artists: true,
            albums: true,
            insights: true
          }
        }
      }
    }));
  });

  it('renders all sidebar navigation checkboxes including Insights', () => {
    const { container } = render(<PreferencesSettings />);

    expect(container.querySelector('#toggleSidebarTabGenre')).not.toBeNull();
    expect(container.querySelector('#toggleSidebarTabFolders')).not.toBeNull();
    expect(container.querySelector('#toggleSidebarTabArtists')).not.toBeNull();
    expect(container.querySelector('#toggleSidebarTabAlbums')).not.toBeNull();
    expect(container.querySelector('#toggleSidebarTabInsights')).not.toBeNull();
  });

  it('toggling Insights checkbox calls setPreferences with insights: false and preserves other tabs', () => {
    const { container } = render(<PreferencesSettings />);
    const insightsCheckbox = container.querySelector(
      '#toggleSidebarTabInsights'
    ) as HTMLInputElement;

    expect(insightsCheckbox).not.toBeNull();
    expect(insightsCheckbox.checked).toBe(true);

    fireEvent.click(insightsCheckbox);

    expect(storage.preferences.setPreferences).toHaveBeenCalledWith('visibleSideTabs', {
      genres: true,
      folders: true,
      artists: true,
      albums: true,
      insights: false
    });
  });

  it('toggling another sidebar tab preserves insights: true in fallback and existing state', () => {
    const { container } = render(<PreferencesSettings />);
    const genreCheckbox = container.querySelector('#toggleSidebarTabGenre') as HTMLInputElement;

    expect(genreCheckbox).not.toBeNull();
    fireEvent.click(genreCheckbox);

    expect(storage.preferences.setPreferences).toHaveBeenCalledWith('visibleSideTabs', {
      genres: false,
      folders: true,
      artists: true,
      albums: true,
      insights: true
    });
  });

  it('preserves insights fallback when preferences.visibleSideTabs is undefined', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          visibleSideTabs: undefined
        }
      }
    }));

    const { container } = render(<PreferencesSettings />);
    const foldersCheckbox = container.querySelector('#toggleSidebarTabFolders') as HTMLInputElement;

    expect(foldersCheckbox).not.toBeNull();
    fireEvent.click(foldersCheckbox);

    expect(storage.preferences.setPreferences).toHaveBeenCalledWith('visibleSideTabs', {
      genres: true,
      folders: false,
      artists: true,
      albums: true,
      insights: true
    });
  });
});
