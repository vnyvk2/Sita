// @vitest-environment jsdom
import TitleBar from '@renderer/components/TitleBar/TitleBar';
import { store } from '@renderer/store/store';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useLocation: ({ select }: { select?: (loc: { href: string }) => unknown }) =>
    select ? select({ href: '/main-player/home' }) : { href: '/main-player/home' }
}));

vi.mock('@renderer/components/TitleBar/NavigationControlsContainer', () => ({
  default: () => <div data-testid="navigation-controls" />
}));

vi.mock('@renderer/components/TitleBar/CurrentLocationContainer', () => ({
  default: ({ href }: { href: string }) => <div data-testid="current-location">{href}</div>
}));

vi.mock('@renderer/components/TitleBar/indicators/NewUpdateIndicator', () => ({
  default: () => <div data-testid="new-update-indicator" />
}));

vi.mock('@renderer/components/TitleBar/indicators/NetworkIndicator', () => ({
  default: () => <div data-testid="network-indicator" />
}));

vi.mock('@renderer/components/TitleBar/special_controls/ChangeThemeBtn', () => ({
  default: () => <button data-testid="change-theme-btn" />
}));

vi.mock('@renderer/components/TitleBar/special_controls/GoToMainPlayerBtn', () => ({
  default: () => <button data-testid="go-to-main-player-btn" />
}));

vi.mock('@renderer/components/TitleBar/WindowControlsContainer', () => ({
  default: () => <div data-testid="window-controls-container" />
}));

vi.mock('@renderer/hooks/useVisualSlot', () => ({
  useVisualSlot: () => undefined,
  useNavVisualSlots: () => ({})
}));

describe('TitleBar', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'api', {
      writable: true,
      value: {
        properties: {
          isInDevelopment: true,
          platform: 'win32'
        }
      }
    });
  });

  it('hides app logo/name, dev URL, indicators, and theme button in fullscreen player mode while keeping GoToMainPlayerBtn and WindowControlsContainer', () => {
    store.setState((prev) => ({
      ...prev,
      playerType: 'full'
    }));

    const { container } = render(<TitleBar />);

    expect(container.querySelector('.logo-and-app-name-container')).toBeNull();
    expect(screen.queryByTestId('current-location')).toBeNull();
    expect(screen.queryByTestId('new-update-indicator')).toBeNull();
    expect(screen.queryByTestId('network-indicator')).toBeNull();
    expect(screen.queryByTestId('change-theme-btn')).toBeNull();

    expect(screen.getByTestId('go-to-main-player-btn')).toBeTruthy();
    expect(screen.getByTestId('window-controls-container')).toBeTruthy();
  });

  it('renders app logo/name, dev URL, indicators, and theme button in normal player mode', () => {
    store.setState((prev) => ({
      ...prev,
      playerType: 'normal'
    }));

    const { container } = render(<TitleBar />);

    expect(container.querySelector('.logo-and-app-name-container')).toBeTruthy();
    expect(screen.getByTestId('current-location')).toBeTruthy();
    expect(screen.getByTestId('new-update-indicator')).toBeTruthy();
    expect(screen.getByTestId('network-indicator')).toBeTruthy();
    expect(screen.getByTestId('change-theme-btn')).toBeTruthy();
    expect(screen.queryByTestId('go-to-main-player-btn')).toBeNull();
    expect(screen.getByTestId('window-controls-container')).toBeTruthy();
  });
});
