// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LyricsSettings from '../LyricsSettings';

// Mock storage
vi.mock('../../../../utils/localStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../utils/localStorage')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      preferences: {
        ...actual.default?.preferences,
        getPreferences: vi.fn().mockReturnValue(false),
        setPreferences: vi.fn()
      }
    }
  };
});

// Mock react-i18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string } | string) => {
        if (typeof options === 'string') return options;
        return options?.defaultValue ?? key;
      }
    })
  };
});

// Mock window.api
beforeEach(() => {
  window.api = {
    settings: {
      updateSaveLyricsInLrcFilesForSupportedSongs: vi.fn(),
      updateCustomLrcFilesSaveLocation: vi.fn()
    },
    settingsHelpers: {
      getFolderLocation: vi.fn().mockResolvedValue('C:\\Lyrics')
    }
  } as unknown as typeof window.api;
});

const renderWithQueryClient = (ui: React.ReactElement) => {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false }
    }
  });
  return render(<QueryClientProvider client={testQueryClient}>{ui}</QueryClientProvider>);
};

describe('LyricsSettings collapsible behavior', () => {
  it('is collapsed by default and does not render inner lyrics options', () => {
    const { container } = renderWithQueryClient(<LyricsSettings />);

    const headerButton = container.querySelector('button[aria-expanded="false"]');
    expect(headerButton).not.toBeNull();
    expect(screen.getByText('settingsPage.lyrics')).toBeDefined();

    // Inner options should not be in the DOM when collapsed
    expect(container.querySelector('.lyrics-appearance-section')).toBeNull();
    expect(container.querySelector('.save-lyrics-automatically')).toBeNull();
    expect(container.querySelector('.always-save-lrc-files')).toBeNull();
    expect(container.querySelector('.lrc-files-custom-save-location')).toBeNull();
    expect(container.querySelector('.auto-translate-lyrics')).toBeNull();
    expect(container.querySelector('.auto-convert-lyrics')).toBeNull();
  });

  it('expands when clicking the header and renders lyrics options', () => {
    const { container } = renderWithQueryClient(<LyricsSettings />);

    const headerButton = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement;
    expect(headerButton).not.toBeNull();

    fireEvent.click(headerButton);

    expect(headerButton.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.lyrics-appearance-section')).not.toBeNull();
    expect(container.querySelector('.save-lyrics-automatically')).not.toBeNull();
    expect(container.querySelector('.always-save-lrc-files')).not.toBeNull();
    expect(container.querySelector('.lrc-files-custom-save-location')).not.toBeNull();
    expect(container.querySelector('.auto-translate-lyrics')).not.toBeNull();
    expect(container.querySelector('.auto-convert-lyrics')).not.toBeNull();
  });

  it('collapses again when clicking the header a second time', () => {
    const { container } = renderWithQueryClient(<LyricsSettings />);

    const headerButton = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement;
    fireEvent.click(headerButton);
    expect(headerButton.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.lyrics-appearance-section')).not.toBeNull();

    fireEvent.click(headerButton);
    expect(headerButton.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.lyrics-appearance-section')).toBeNull();
  });
});
