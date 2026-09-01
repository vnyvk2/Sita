// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AccountsSettings from '../AccountsSettings';

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
      updateSongScrobblingToListenBrainzState: vi.fn(),
      updateSongFavoritesToListenBrainzState: vi.fn(),
      updateNowPlayingSongDataToListenBrainzState: vi.fn(),
      updateDiscordRpcState: vi.fn(),
      updateSongScrobblingToLastFMState: vi.fn(),
      updateSongFavoritesToLastFMState: vi.fn(),
      updateNowPlayingSongDataToLastFMState: vi.fn()
    },
    settingsHelpers: {
      disconnectLastFm: vi.fn(),
      loginToLastFmInBrowser: vi.fn(),
      openInBrowser: vi.fn()
    },
    listenBrainz: {
      validateAndSaveToken: vi.fn(),
      disconnect: vi.fn()
    },
    spotify: {
      connect: vi.fn(),
      disconnect: vi.fn()
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

describe('AccountsSettings collapsible behavior', () => {
  it('is collapsed by default and does not render integration items', () => {
    const { container } = renderWithQueryClient(<AccountsSettings />);

    const headerButton = container.querySelector('button[aria-expanded="false"]');
    expect(headerButton).not.toBeNull();
    expect(screen.getByText('settingsPage.accounts')).toBeDefined();

    // Integrations should not be in the DOM when collapsed
    expect(container.querySelector('.spotify-integration')).toBeNull();
    expect(container.querySelector('.discord-rpc-integration')).toBeNull();
    expect(container.querySelector('.last-fm-integration')).toBeNull();
    expect(container.querySelector('.listenbrainz-integration')).toBeNull();
  });

  it('expands when clicking the header and renders integration items', () => {
    const { container } = renderWithQueryClient(<AccountsSettings />);

    const headerButton = container.querySelector(
      'button[aria-expanded="false"]'
    ) as HTMLButtonElement;
    expect(headerButton).not.toBeNull();

    fireEvent.click(headerButton);

    expect(headerButton.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.spotify-integration')).not.toBeNull();
    expect(container.querySelector('.discord-rpc-integration')).not.toBeNull();
    expect(container.querySelector('.last-fm-integration')).not.toBeNull();
    expect(container.querySelector('.listenbrainz-integration')).not.toBeNull();
  });

  it('collapses again when clicking the header a second time', () => {
    const { container } = renderWithQueryClient(<AccountsSettings />);

    const headerButton = container.querySelector(
      'button[aria-expanded="false"]'
    ) as HTMLButtonElement;
    fireEvent.click(headerButton);
    expect(headerButton.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.spotify-integration')).not.toBeNull();

    fireEvent.click(headerButton);
    expect(headerButton.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.spotify-integration')).toBeNull();
  });
});
