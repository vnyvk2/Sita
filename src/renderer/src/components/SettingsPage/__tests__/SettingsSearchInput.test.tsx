// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SettingsCollapseContext,
  type SettingsCollapseContextType
} from '../Settings/SettingsCollapseContext';
import { SettingsSearchInput } from '../SettingsSearchInput';

// Mock react-i18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultValueOrOptions?: unknown, options?: unknown) => {
        if (key === 'settingsPage.searchSettings') return 'Search settings... (Ctrl+F or /)';
        if (key === 'settingsPage.noMatchingSettings') {
          const optQuery = (options as { query?: string } | undefined)?.query;
          const defaultQuery = (defaultValueOrOptions as { query?: string } | undefined)?.query;
          const q = optQuery ?? defaultQuery ?? '';
          return `No settings found matching "${q}"`;
        }
        if (typeof defaultValueOrOptions === 'string') return defaultValueOrOptions;
        return (defaultValueOrOptions as { defaultValue?: string } | undefined)?.defaultValue ?? key;
      }
    })
  };
});

describe('SettingsSearchInput component', () => {
  let mockJumpToSetting: ReturnType<typeof vi.fn>;
  let mockCollapseContext: SettingsCollapseContextType;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJumpToSetting = vi.fn();
    mockCollapseContext = {
      isSectionExpanded: vi.fn().mockReturnValue(true),
      toggleSection: vi.fn(),
      expandSection: vi.fn(),
      collapseAll: vi.fn(),
      expandAll: vi.fn(),
      areAllCollapsed: false,
      jumpToSetting: mockJumpToSetting,
      highlightedSettingId: null
    };
  });

  const renderComponent = () => {
    return render(
      <SettingsCollapseContext.Provider value={mockCollapseContext}>
        <SettingsSearchInput />
      </SettingsCollapseContext.Provider>
    );
  };

  it('renders input with full WAI-ARIA combobox 1.2 attributes', () => {
    renderComponent();

    const input = screen.getByRole('combobox');
    expect(input).toBeDefined();
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-haspopup')).toBe('listbox');
    expect(input.getAttribute('aria-controls')).toBeTruthy();
  });

  it('opens dropdown when query is entered and updates aria-expanded to true', () => {
    renderComponent();

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'theme' } });

    expect(input.getAttribute('aria-expanded')).toBe('true');
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeDefined();

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
  });

  it('navigates through options with ArrowDown and ArrowUp updating aria-activedescendant', () => {
    renderComponent();

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'theme' } });

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);

    // Initial item is active index 0
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[0].getAttribute('aria-selected')).toBe('true');

    // ArrowDown moves to index 1
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);
    expect(options[1].getAttribute('aria-selected')).toBe('true');

    // ArrowUp moves back to index 0
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
  });

  it('triggers jumpToSetting and closes dropdown when Enter is pressed on an option', () => {
    renderComponent();

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'theme' } });

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockJumpToSetting).toHaveBeenCalledTimes(1);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('triggers jumpToSetting when an option is clicked', () => {
    renderComponent();

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'theme' } });

    const options = screen.getAllByRole('option');
    fireEvent.click(options[0]);

    expect(mockJumpToSetting).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes dropdown and resets on Escape key', () => {
    renderComponent();

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'crossfade' } });
    expect(input.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('focuses search input when global Ctrl+F is pressed', () => {
    renderComponent();

    const input = screen.getByRole('combobox');
    expect(document.activeElement).not.toBe(input);

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    expect(document.activeElement).toBe(input);
  });

  it('focuses search input when "/" is pressed and user is NOT typing in an input', () => {
    renderComponent();

    const input = screen.getByRole('combobox');
    expect(document.activeElement).not.toBe(input);

    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(input);
  });

  it('does NOT intercept "/" when user is already typing in an input element', () => {
    const { container } = render(
      <div>
        <input data-testid="other-input" type="text" />
        <SettingsCollapseContext.Provider value={mockCollapseContext}>
          <SettingsSearchInput />
        </SettingsCollapseContext.Provider>
      </div>
    );

    const otherInput = screen.getByTestId('other-input');
    const searchInput = screen.getByRole('combobox');

    otherInput.focus();
    expect(document.activeElement).toBe(otherInput);

    fireEvent.keyDown(otherInput, { key: '/' });
    // Focus should remain on otherInput, not jump to searchInput
    expect(document.activeElement).toBe(otherInput);
    expect(document.activeElement).not.toBe(searchInput);
  });

  it('prevents default on onMouseDown to avoid blur race, and executes jumpToSetting exactly once on click', () => {
    renderComponent();

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'theme' } });

    const options = screen.getAllByRole('option');
    const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    fireEvent(options[0], mouseDownEvent);
    expect(mouseDownEvent.defaultPrevented).toBe(true);

    // Click triggers selection
    fireEvent.click(options[0]);

    // Must be called exactly once (no double fire)
    expect(mockJumpToSetting).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders translated or authoritative section badge names', () => {
    renderComponent();

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'theme' } });

    // Section badge for appearance should be present
    expect(screen.getAllByText('Appearance').length).toBeGreaterThan(0);
  });

  it('does NOT intercept "/" when modifier keys are pressed', () => {
    renderComponent();

    const input = screen.getByRole('combobox');
    expect(document.activeElement).not.toBe(input);

    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(document.activeElement).not.toBe(input);

    fireEvent.keyDown(window, { key: '/', altKey: true });
    expect(document.activeElement).not.toBe(input);

    fireEvent.keyDown(window, { key: '/', metaKey: true });
    expect(document.activeElement).not.toBe(input);

    fireEvent.keyDown(window, { key: '/', shiftKey: true });
    expect(document.activeElement).not.toBe(input);
  });

  it('does NOT intercept "/" when a button or dialog element is focused', () => {
    render(
      <div>
        <button data-testid="other-button" type="button">
          Click me
        </button>
        <div role="dialog" data-testid="dialog-container">
          <button data-testid="inside-dialog" type="button">
            Inside Dialog
          </button>
        </div>
        <SettingsCollapseContext.Provider value={mockCollapseContext}>
          <SettingsSearchInput />
        </SettingsCollapseContext.Provider>
      </div>
    );

    const button = screen.getByTestId('other-button');
    const insideDialog = screen.getByTestId('inside-dialog');
    const searchInput = screen.getByRole('combobox');

    button.focus();
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(button);
    expect(document.activeElement).not.toBe(searchInput);

    insideDialog.focus();
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(insideDialog);
    expect(document.activeElement).not.toBe(searchInput);
  });

  it('does NOT intercept Ctrl+F when another text input is focused', () => {
    render(
      <div>
        <input data-testid="other-input" type="text" />
        <SettingsCollapseContext.Provider value={mockCollapseContext}>
          <SettingsSearchInput />
        </SettingsCollapseContext.Provider>
      </div>
    );

    const otherInput = screen.getByTestId('other-input');
    const searchInput = screen.getByRole('combobox');

    otherInput.focus();
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

    expect(document.activeElement).toBe(otherInput);
    expect(document.activeElement).not.toBe(searchInput);
  });

  it('does NOT intercept Ctrl+F when a select element is focused', () => {
    render(
      <div>
        <select data-testid="other-select">
          <option value="1">Option 1</option>
        </select>
        <SettingsCollapseContext.Provider value={mockCollapseContext}>
          <SettingsSearchInput />
        </SettingsCollapseContext.Provider>
      </div>
    );

    const otherSelect = screen.getByTestId('other-select');
    const searchInput = screen.getByPlaceholderText('Search settings... (Ctrl+F or /)');

    otherSelect.focus();
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

    expect(document.activeElement).toBe(otherSelect);
    expect(document.activeElement).not.toBe(searchInput);
  });

  it('displays empty state when no settings match query', () => {
    renderComponent();

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'nonexistentgibberishqueryxyz' } });

    expect(input.getAttribute('aria-expanded')).toBe('true');
    const emptyElements = screen.getAllByText('No settings found matching "nonexistentgibberishqueryxyz"');
    expect(emptyElements).toHaveLength(2);
  });
});
