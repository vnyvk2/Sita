// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import CollapsibleSettingsSection from '../CollapsibleSettingsSection';
import {
  SettingsCollapseProvider,
  useSettingsCollapse
} from '../SettingsCollapseContext';

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

describe('CollapsibleSettingsSection standalone behavior', () => {
  it('renders expanded by default when defaultExpanded is true', () => {
    const { container } = render(
      <CollapsibleSettingsSection
        id="test-settings-container"
        sectionKey="appearance"
        title="Appearance"
        iconName="dark_mode"
        defaultExpanded={true}
      >
        <div data-testid="test-content">Appearance Content</div>
      </CollapsibleSettingsSection>
    );

    const button = container.querySelector('button[aria-expanded="true"]');
    expect(button).not.toBeNull();
    expect(screen.getByTestId('test-content')).toBeDefined();
  });

  it('renders collapsed when defaultExpanded is false', () => {
    const { container } = render(
      <CollapsibleSettingsSection
        id="test-settings-container"
        sectionKey="appearance"
        title="Appearance"
        iconName="dark_mode"
        defaultExpanded={false}
      >
        <div data-testid="test-content">Appearance Content</div>
      </CollapsibleSettingsSection>
    );

    const button = container.querySelector('button[aria-expanded="false"]');
    expect(button).not.toBeNull();
    expect(screen.queryByTestId('test-content')).toBeNull();
  });

  it('toggles collapse state on button click in standalone mode', () => {
    const { container } = render(
      <CollapsibleSettingsSection
        id="test-settings-container"
        sectionKey="appearance"
        title="Appearance"
        iconName="dark_mode"
        defaultExpanded={true}
      >
        <div data-testid="test-content">Appearance Content</div>
      </CollapsibleSettingsSection>
    );

    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('test-content')).toBeDefined();

    // Click to collapse
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('test-content')).toBeNull();

    // Click to expand
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('test-content')).toBeDefined();
  });
});

const ConsumerTestComponent = () => {
  const collapse = useSettingsCollapse();
  if (!collapse) return null;

  return (
    <div>
      <button type="button" onClick={collapse.collapseAll} data-testid="collapse-all-btn">
        {collapse.areAllCollapsed ? 'Expand all' : 'Collapse all'}
      </button>
      <button type="button" onClick={collapse.expandAll} data-testid="expand-all-btn">
        Expand all
      </button>
      <CollapsibleSettingsSection
        id="appearance-container"
        sectionKey="appearance"
        title="Appearance"
      >
        <div data-testid="appearance-content">Appearance Content</div>
      </CollapsibleSettingsSection>
      <CollapsibleSettingsSection
        id="advanced-container"
        sectionKey="advanced"
        title="Advanced"
      >
        <div data-testid="advanced-content">Advanced Content</div>
      </CollapsibleSettingsSection>
    </div>
  );
};

describe('SettingsCollapseProvider integration', () => {
  it('starts with all sections expanded and areAllCollapsed = false', () => {
    render(
      <SettingsCollapseProvider>
        <ConsumerTestComponent />
      </SettingsCollapseProvider>
    );

    expect(screen.getByTestId('appearance-content')).toBeDefined();
    expect(screen.getByTestId('advanced-content')).toBeDefined();
    expect(screen.getByTestId('collapse-all-btn').textContent).toBe('Collapse all');
  });

  it('collapses all sections when collapseAll is triggered', () => {
    render(
      <SettingsCollapseProvider>
        <ConsumerTestComponent />
      </SettingsCollapseProvider>
    );

    const collapseAllBtn = screen.getByTestId('collapse-all-btn');
    fireEvent.click(collapseAllBtn);

    expect(screen.queryByTestId('appearance-content')).toBeNull();
    expect(screen.queryByTestId('advanced-content')).toBeNull();
    expect(collapseAllBtn.textContent).toBe('Expand all');
  });

  it('expands all sections when expandAll is triggered', () => {
    render(
      <SettingsCollapseProvider>
        <ConsumerTestComponent />
      </SettingsCollapseProvider>
    );

    const collapseAllBtn = screen.getByTestId('collapse-all-btn');
    fireEvent.click(collapseAllBtn);

    expect(screen.queryByTestId('appearance-content')).toBeNull();

    const expandAllBtn = screen.getByTestId('expand-all-btn');
    fireEvent.click(expandAllBtn);

    expect(screen.getByTestId('appearance-content')).toBeDefined();
    expect(screen.getByTestId('advanced-content')).toBeDefined();
    expect(collapseAllBtn.textContent).toBe('Collapse all');
  });
});
