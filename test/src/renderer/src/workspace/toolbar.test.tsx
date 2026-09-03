import { getInitialWorkspaceState } from '@renderer/workspace/persistence';
import { DEFAULT_PRESET } from '@renderer/workspace/presets/default';
import { MUSICBEE_PRESET } from '@renderer/workspace/presets/musicbee';
import { workspaceActions, workspaceStore } from '@renderer/workspace/store';
import { WorkspaceToolbar } from '@renderer/workspace/ui/WorkspaceToolbar';
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock react-i18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (_key: string, defaultVal?: string) => defaultVal ?? _key
    })
  };
});

describe('WorkspaceToolbar', () => {
  beforeEach(() => {
    workspaceStore.setState(() => getInitialWorkspaceState());
  });

  it('renders active preset name and allows switching workspace', () => {
    render(<WorkspaceToolbar />);

    expect(screen.getByText('Default')).toBeDefined();
    expect(screen.getByText('MusicBee')).toBeDefined();

    const musicBeeBtn = screen.getByText('MusicBee');
    fireEvent.click(musicBeeBtn);

    expect(workspaceStore.state.active).toBe(MUSICBEE_PRESET.id);
  });

  it('opens panel catalog and inserts a panel on click', () => {
    render(<WorkspaceToolbar />);

    const addBtn = screen.getByText('Add Panel');
    fireEvent.click(addBtn);

    expect(screen.getByText('Available Panels')).toBeDefined();
    expect(screen.getByText('Visualizer')).toBeDefined();

    const visualizerItem = screen.getByText('Visualizer');
    fireEvent.click(visualizerItem);

    // Verify visualizer was inserted into active workspace panels
    const activeWs = workspaceStore.state.workspaces[workspaceStore.state.active];
    const hasVisualizer = Object.values(activeWs.panels).some((p) => p.type === 'visualizer');
    expect(hasVisualizer).toBe(true);
  });

  it('dispatches reset layout on clicking reset button', () => {
    const dispatchSpy = vi.spyOn(workspaceActions, 'dispatchOp');
    render(<WorkspaceToolbar />);

    const resetBtn = screen.getByTitle('Reset layout to preset defaults');
    fireEvent.click(resetBtn);

    expect(dispatchSpy).toHaveBeenCalledWith({
      t: 'ws.reset',
      id: DEFAULT_PRESET.id,
      defaultPreset: DEFAULT_PRESET
    });

    dispatchSpy.mockRestore();
  });

  it('collapses and expands the toolbar', () => {
    render(<WorkspaceToolbar />);

    const collapseBtn = screen.getByTitle('Minimize toolbar');
    fireEvent.click(collapseBtn);

    // Now in collapsed state
    expect(screen.getByTitle('Show Workspace Bar')).toBeDefined();

    // Expand
    const expandBtn = screen.getByTitle('Show Workspace Bar');
    fireEvent.click(expandBtn);

    expect(screen.getByText('Add Panel')).toBeDefined();
  });
});
