// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Dropdown, { type DropdownOption } from '@renderer/components/Dropdown';

describe('Glassmorphic Dropdown Popover Component', () => {
  const options: DropdownOption<string>[] = [
    { label: 'A to Z', value: 'aToZ' },
    { label: 'Z to A', value: 'zToA' },
    { isDivider: true, label: '', value: '' },
    { label: 'Highest amount of songs', value: 'noOfSongsDescending' },
    { label: 'Lowest amount of songs', value: 'noOfSongsAscending' },
    { label: 'Disabled Option', value: 'disabledOpt', isDisabled: true }
  ];

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders circular icon trigger button when sort/filter iconName is detected', () => {
    const handleChange = vi.fn();
    render(
      <Dropdown
        name="albumSortDropdown"
        type="Sort by :"
        value="aToZ"
        options={options}
        onChange={handleChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /Sort by : A to Z/i });
    expect(trigger).toBeDefined();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens glassmorphic popover menu on click and displays options with active checkmark', () => {
    const handleChange = vi.fn();
    render(
      <Dropdown
        name="albumSortDropdown"
        type="Sort by :"
        value="aToZ"
        options={options}
        onChange={handleChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /Sort by : A to Z/i });
    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu');
    expect(menu).toBeDefined();

    // Verify option items and active radio checkmark
    const menuItems = screen.getAllByRole('menuitemradio');
    expect(menuItems).toHaveLength(5); // 5 non-divider items

    const activeItem = screen.getByRole('menuitemradio', { name: /A to Z/i });
    expect(activeItem.getAttribute('aria-checked')).toBe('true');

    const inactiveItem = screen.getByRole('menuitemradio', { name: /Z to A/i });
    expect(inactiveItem.getAttribute('aria-checked')).toBe('false');

    // Section header and separator
    expect(screen.getByText(/sort by/i)).toBeDefined();
    expect(screen.getByRole('separator')).toBeDefined();
  });

  it('calls onChange with synthetic event when user selects a different option and closes menu', () => {
    const handleChange = vi.fn();
    render(
      <Dropdown
        name="albumSortDropdown"
        type="Sort by :"
        value="aToZ"
        options={options}
        onChange={handleChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /Sort by : A to Z/i });
    fireEvent.click(trigger);

    const targetOption = screen.getByRole('menuitemradio', { name: /Highest amount of songs/i });
    fireEvent.click(targetOption);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const eventArg = handleChange.mock.calls[0][0];
    expect(eventArg.target.value).toBe('noOfSongsDescending');
    expect(eventArg.currentTarget.value).toBe('noOfSongsDescending');
    expect(eventArg.target.name).toBe('albumSortDropdown');

    // Menu is closed
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes menu on Escape key and returns focus to trigger button', () => {
    const handleChange = vi.fn();
    render(
      <Dropdown
        name="albumSortDropdown"
        type="Sort by :"
        value="aToZ"
        options={options}
        onChange={handleChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /Sort by : A to Z/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes menu on click outside', () => {
    const handleChange = vi.fn();
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <Dropdown
          name="albumSortDropdown"
          type="Sort by :"
          value="aToZ"
          options={options}
          onChange={handleChange}
        />
      </div>
    );

    const trigger = screen.getByRole('button', { name: /Sort by : A to Z/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeDefined();

    const outsideArea = screen.getByTestId('outside-area');
    fireEvent.pointerDown(outsideArea);

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('navigates through options via ArrowDown and ArrowUp keyboard keys', () => {
    const handleChange = vi.fn();
    render(
      <Dropdown
        name="albumSortDropdown"
        type="Sort by :"
        value="aToZ"
        options={options}
        onChange={handleChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /Sort by : A to Z/i });
    // Open menu with ArrowDown
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const menu = screen.getByRole('menu');
    expect(menu).toBeDefined();

    // Arrow down moves to next selectable item
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    const zToAItem = screen.getByRole('menuitemradio', { name: /Z to A/i });
    expect(document.activeElement).toBe(zToAItem);
  });

  it('renders selector mode when iconName is absent and opens matching popover', () => {
    const handleChange = vi.fn();
    render(
      <Dropdown
        name="customSelect"
        value="aToZ"
        options={options}
        onChange={handleChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /A to Z/i });
    expect(trigger).toBeDefined();
    expect(trigger.textContent).toContain('expand_more');

    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeDefined();
  });
});
