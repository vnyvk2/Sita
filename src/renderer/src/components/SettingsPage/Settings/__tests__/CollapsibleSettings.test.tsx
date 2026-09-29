// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import CollapsibleSettingsSection from '../CollapsibleSettingsSection';
import {
  SettingsCollapseProvider,
  useSettingsCollapse,
  useSettingsCollapseActions
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

  it('automatically uncollapses section and mounts DOM target when jumpToSetting is invoked', () => {
    const JumpConsumer = () => {
      const collapse = useSettingsCollapse()!;
      return (
        <div>
          <button
            type="button"
            onClick={() => collapse.jumpToSetting('target-item', 'advanced')}
            data-testid="jump-btn"
          >
            Jump to Advanced
          </button>
          <button
            type="button"
            onClick={collapse.collapseAll}
            data-testid="collapse-all-btn"
          >
            Collapse all
          </button>
          <CollapsibleSettingsSection
            id="advanced-container"
            sectionKey="advanced"
            title="Advanced"
          >
            <div id="target-item" data-testid="target-item">
              Target Setting
            </div>
          </CollapsibleSettingsSection>
        </div>
      );
    };

    render(
      <SettingsCollapseProvider>
        <JumpConsumer />
      </SettingsCollapseProvider>
    );

    // 1. Collapse all sections
    fireEvent.click(screen.getByTestId('collapse-all-btn'));
    expect(screen.queryByTestId('target-item')).toBeNull();

    // 2. Trigger jumpToSetting
    fireEvent.click(screen.getByTestId('jump-btn'));

    // 3. Section should now be automatically expanded and item mounted in DOM
    expect(screen.getByTestId('target-item')).toBeDefined();
  });

  it('prevents spotlight class leak on rapid consecutive jumps', async () => {
    // Mock requestAnimationFrame to run immediately
    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => {
      cb(0);
      return 0;
    };

    const MultiJumpConsumer = () => {
      const actions = useSettingsCollapseActions()!;
      return (
        <div>
          <button
            type="button"
            onClick={() => actions.jumpToSetting('item-1', 'appearance')}
            data-testid="jump-1"
          >
            Jump 1
          </button>
          <button
            type="button"
            onClick={() => actions.jumpToSetting('item-2', 'appearance')}
            data-testid="jump-2"
          >
            Jump 2
          </button>
          <CollapsibleSettingsSection
            id="appearance-container"
            sectionKey="appearance"
            title="Appearance"
          >
            <div id="item-1" data-testid="item-1">
              Item 1
            </div>
            <div id="item-2" data-testid="item-2">
              Item 2
            </div>
          </CollapsibleSettingsSection>
        </div>
      );
    };

    const { container } = render(
      <SettingsCollapseProvider>
        <MultiJumpConsumer />
      </SettingsCollapseProvider>
    );

    // Jump to Item 1
    fireEvent.click(screen.getByTestId('jump-1'));
    const item1 = container.querySelector('#item-1');
    expect(item1?.classList.contains('setting-spotlight-active')).toBe(true);

    // Rapidly jump to Item 2 without waiting for 2.2s timeout
    fireEvent.click(screen.getByTestId('jump-2'));
    const item2 = container.querySelector('#item-2');

    // Item 1 should have had its spotlight class stripped immediately, and only Item 2 has it
    expect(item1?.classList.contains('setting-spotlight-active')).toBe(false);
    expect(item2?.classList.contains('setting-spotlight-active')).toBe(true);

    window.requestAnimationFrame = originalRaf;
  });

  it('provides stable actions identity across section toggle re-renders', () => {
    let actionsReference1: unknown;
    let actionsReference2: unknown;

    const TestObserver = () => {
      const actions = useSettingsCollapseActions()!;
      if (!actionsReference1) {
        actionsReference1 = actions;
      } else {
        actionsReference2 = actions;
      }

      return (
        <button
          type="button"
          onClick={() => actions.toggleSection('appearance')}
          data-testid="toggle-btn"
        >
          Toggle
        </button>
      );
    };

    render(
      <SettingsCollapseProvider>
        <TestObserver />
      </SettingsCollapseProvider>
    );

    // Trigger state change
    fireEvent.click(screen.getByTestId('toggle-btn'));

    // Even if children re-render, useSettingsCollapseActions returns identical memoized reference
    expect(actionsReference1).toBeDefined();
    expect(actionsReference1).toBe(actionsReference2 ?? actionsReference1);
  });

  it('transfers focus and sets tabindex on target element upon jump', () => {
    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => {
      cb(0);
      return 0;
    };

    const FocusConsumer = () => {
      const actions = useSettingsCollapseActions()!;
      return (
        <div>
          <button
            type="button"
            onClick={() => actions.jumpToSetting('focus-target', 'appearance')}
            data-testid="jump-focus-btn"
          >
            Jump
          </button>
          <CollapsibleSettingsSection
            id="appearance-container"
            sectionKey="appearance"
            title="Appearance"
          >
            <div id="focus-target" data-testid="focus-target">
              Focus Target
            </div>
          </CollapsibleSettingsSection>
        </div>
      );
    };

    const { container } = render(
      <SettingsCollapseProvider>
        <FocusConsumer />
      </SettingsCollapseProvider>
    );

    fireEvent.click(screen.getByTestId('jump-focus-btn'));

    const target = container.querySelector('#focus-target') as HTMLElement;
    expect(target).not.toBeNull();
    expect(target.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(target);

    window.requestAnimationFrame = originalRaf;
  });

  it('retries finding an asynchronously mounted setting and applies spotlight', async () => {
    const AsyncSettingComponent = () => {
      const actions = useSettingsCollapseActions()!;
      const [mounted, setMounted] = useState(false);

      useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 80);
        return () => clearTimeout(timer);
      }, []);

      return (
        <div>
          <button
            type="button"
            onClick={() => actions.jumpToSetting('async-target', 'metadata')}
            data-testid="jump-async-btn"
          >
            Jump Async
          </button>
          <CollapsibleSettingsSection
            id="metadata-container"
            sectionKey="metadata"
            title="Metadata"
          >
            {mounted && (
              <div id="async-target" data-testid="async-target">
                Async Setting Content
              </div>
            )}
          </CollapsibleSettingsSection>
        </div>
      );
    };

    const { container } = render(
      <SettingsCollapseProvider>
        <AsyncSettingComponent />
      </SettingsCollapseProvider>
    );

    fireEvent.click(screen.getByTestId('jump-async-btn'));

    await vi.waitFor(
      () => {
        const target = container.querySelector('#async-target');
        expect(target).not.toBeNull();
        expect(target?.classList.contains('setting-spotlight-active')).toBe(true);
      },
      { timeout: 1000 }
    );
  });

  it('logs warning when target setting is not found after retry timeout', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const MissingConsumer = () => {
      const actions = useSettingsCollapseActions()!;
      return (
        <div>
          <button
            type="button"
            onClick={() => actions.jumpToSetting('nonexistent-target', 'appearance')}
            data-testid="jump-missing-btn"
          >
            Jump Missing
          </button>
          <CollapsibleSettingsSection
            id="appearance-container"
            sectionKey="appearance"
            title="Appearance"
          >
            <div>Appearance Content</div>
          </CollapsibleSettingsSection>
        </div>
      );
    };

    render(
      <SettingsCollapseProvider>
        <MissingConsumer />
      </SettingsCollapseProvider>
    );

    fireEvent.click(screen.getByTestId('jump-missing-btn'));

    await vi.waitFor(
      () => {
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Settings] Setting #nonexistent-target not found in DOM')
        );
      },
      { timeout: 2500 }
    );

    warnSpy.mockRestore();
  });
});

