import { getInitialWorkspaceState } from '@renderer/workspace/persistence';
import { DEFAULT_PRESET } from '@renderer/workspace/presets/default';
import { MUSICBEE_PRESET } from '@renderer/workspace/presets/musicbee';
import { dndStore, workspaceActions, workspaceStore } from '@renderer/workspace/store';
import { WorkspaceToolbar } from '@renderer/workspace/ui/WorkspaceToolbar';
// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
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
    dndStore.setState((s) => ({
      ...s,
      isDragging: false,
      currentDrag: null,
      hoveredDropTarget: null,
      maximizedPanelId: null,
      isToolbarCollapsed: false,
      sidebarMode: 'expanded',
      isSaveLayoutModalOpen: false,
      saveLayoutModalMode: 'save',
      targetWorkspaceId: null
    }));
  });

  it('renders active layout name in trigger button and allows switching workspace via dropdown', () => {
    render(<WorkspaceToolbar />);

    // Trigger button shows Layout: Default
    const triggerBtn = screen.getByTitle('Workspace Layout: Default');
    expect(triggerBtn).toBeDefined();
    expect(screen.getByText('Layout:')).toBeDefined();

    // Dropdown is initially closed
    expect(screen.queryByText('Workspaces')).toBeNull();

    // Open dropdown
    fireEvent.click(triggerBtn);
    expect(screen.getByText('Workspaces')).toBeDefined();
    expect(screen.getByText('MusicBee')).toBeDefined();

    // Switch to MusicBee
    const musicBeeOption = screen.getByRole('menuitem', { name: /MusicBee/i });
    fireEvent.click(musicBeeOption);

    // Active workspace switched and dropdown closed
    expect(workspaceStore.state.active).toBe(MUSICBEE_PRESET.id);
    expect(screen.queryByText('Workspaces')).toBeNull();
    expect(screen.getByTitle('Workspace Layout: MusicBee')).toBeDefined();
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

  it('collapses toolbar without duplicate floating button and expands cleanly', () => {
    render(<WorkspaceToolbar />);

    const collapseBtn = screen.getByTitle('Minimize toolbar');
    fireEvent.click(collapseBtn);

    // Collapsed state: duplicate floating button must NOT exist
    expect(screen.queryByTitle('Show Workspace Bar')).toBeNull();
    expect(screen.queryByText('Add Panel')).toBeNull();

    // Uncollapse (simulating TitleBar restore button click)
    act(() => {
      workspaceActions.setToolbarCollapsed(false);
    });

    expect(screen.getByText('Add Panel')).toBeDefined();
    expect(screen.getByTitle('Workspace Layout: Default')).toBeDefined();
  });

  describe('Workspace Selector Dropdown Behavior', () => {
    it('closes the workspace dropdown when clicking outside or pressing Escape', () => {
      render(<WorkspaceToolbar />);

      const triggerBtn = screen.getByTitle('Workspace Layout: Default');
      fireEvent.click(triggerBtn);
      expect(screen.getByText('Workspaces')).toBeDefined();

      // Outside click closes it
      fireEvent.mouseDown(document.body);
      expect(screen.queryByText('Workspaces')).toBeNull();

      // Reopen and test Escape
      fireEvent.click(triggerBtn);
      expect(screen.getByText('Workspaces')).toBeDefined();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText('Workspaces')).toBeNull();
    });

    it('resets layout from the dropdown menu action', () => {
      const dispatchSpy = vi.spyOn(workspaceActions, 'dispatchOp');
      render(<WorkspaceToolbar />);

      const triggerBtn = screen.getByTitle('Workspace Layout: Default');
      fireEvent.click(triggerBtn);

      const dropdownResetBtn = screen.getByText('Reset Layout to Default');
      fireEvent.click(dropdownResetBtn);

      expect(dispatchSpy).toHaveBeenCalledWith({
        t: 'ws.reset',
        id: DEFAULT_PRESET.id,
        defaultPreset: DEFAULT_PRESET
      });

      dispatchSpy.mockRestore();
    });
  });

  describe('Save Layout and Modal Integration', () => {
    const openSaveModal = () => {
      const triggerBtn = screen.getByTitle(
        `Workspace Layout: ${workspaceStore.state.workspaces[workspaceStore.state.active].name}`
      );
      fireEvent.click(triggerBtn);
      const saveBtn = screen.getByText('+ Save Current Layout As...');
      fireEvent.click(saveBtn);
    };

    it('opens SaveLayoutModal from dropdown "+ Save Current Layout As..." and closes on Cancel/Escape', () => {
      render(<WorkspaceToolbar />);

      openSaveModal();

      expect(dndStore.state.isSaveLayoutModalOpen).toBe(true);
      expect(screen.getByText('Save Custom Layout')).toBeDefined();

      // Test Cancel button
      const cancelBtn = screen.getByText('Cancel');
      fireEvent.click(cancelBtn);

      expect(dndStore.state.isSaveLayoutModalOpen).toBe(false);
      expect(screen.queryByText('Save Custom Layout')).toBeNull();

      // Reopen and test Escape key on input
      openSaveModal();
      expect(dndStore.state.isSaveLayoutModalOpen).toBe(true);

      const input = screen.getByPlaceholderText('e.g. Studio Layout, Lyrics Focus...');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(dndStore.state.isSaveLayoutModalOpen).toBe(false);
      expect(screen.queryByText('Save Custom Layout')).toBeNull();
    });

    it('submitting SaveLayoutModal creates a new workspace and switches to it', () => {
      render(<WorkspaceToolbar />);

      openSaveModal();

      const input = screen.getByPlaceholderText('e.g. Studio Layout, Lyrics Focus...');
      fireEvent.change(input, { target: { value: 'Studio Layout' } });

      const saveSubmitBtn = screen.getByRole('button', { name: 'Save' });
      fireEvent.click(saveSubmitBtn);

      // Verify workspace created and active
      const activeWs = workspaceStore.state.workspaces[workspaceStore.state.active];
      expect(activeWs.name).toBe('Studio Layout');
      expect(dndStore.state.isSaveLayoutModalOpen).toBe(false);

      // Verify new layout is shown in the toolbar trigger
      expect(screen.getByTitle('Workspace Layout: Studio Layout')).toBeDefined();

      // Open dropdown to verify it is listed among workspaces
      fireEvent.click(screen.getByTitle('Workspace Layout: Studio Layout'));
      expect(screen.getAllByText('Studio Layout').length).toBeGreaterThanOrEqual(1);
    });

    it('disables save button when input is empty or whitespace-only', () => {
      render(<WorkspaceToolbar />);

      openSaveModal();

      const input = screen.getByPlaceholderText('e.g. Studio Layout, Lyrics Focus...');
      fireEvent.change(input, { target: { value: '   ' } });

      const saveSubmitBtn = screen.getByRole('button', { name: 'Save' });
      expect((saveSubmitBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('closes SaveLayoutModal when backdrop is clicked', () => {
      render(<WorkspaceToolbar />);

      openSaveModal();
      expect(dndStore.state.isSaveLayoutModalOpen).toBe(true);

      const backdrop = screen.getByRole('presentation');
      fireEvent.click(backdrop);

      expect(dndStore.state.isSaveLayoutModalOpen).toBe(false);
      expect(screen.queryByText('Save Custom Layout')).toBeNull();
    });

    it('closes SaveLayoutModal when Escape key is pressed globally', () => {
      render(<WorkspaceToolbar />);

      openSaveModal();
      expect(dndStore.state.isSaveLayoutModalOpen).toBe(true);

      const cancelBtn = screen.getByText('Cancel');
      cancelBtn.focus();

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(dndStore.state.isSaveLayoutModalOpen).toBe(false);
    });

    it('traps Tab focus inside the modal dialog', () => {
      render(<WorkspaceToolbar />);

      openSaveModal();

      const closeBtn = screen.getByLabelText('Close');
      const saveSubmitBtn = screen.getByRole('button', { name: 'Save' });

      // Tab on last focusable element wraps to first
      saveSubmitBtn.focus();
      expect(document.activeElement).toBe(saveSubmitBtn);

      fireEvent.keyDown(window, { key: 'Tab' });
      expect(document.activeElement).toBe(closeBtn);

      // Shift+Tab on first focusable element wraps to last
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(saveSubmitBtn);
    });
  });

  describe('Workspace Dropdown Actions (Rename, Duplicate, Delete)', () => {
    it('allows duplicating a default preset from dropdown actions', () => {
      render(<WorkspaceToolbar />);

      // Open dropdown
      const triggerBtn = screen.getByTitle('Workspace Layout: Default');
      fireEvent.click(triggerBtn);

      // Default preset has Preset tag
      expect(screen.getAllByText('Preset').length).toBe(2);

      // Default preset should NOT have Rename or Delete buttons
      expect(screen.queryByLabelText('Rename Default')).toBeNull();
      expect(screen.queryByLabelText('Delete Default')).toBeNull();

      // Duplicate Default
      const duplicateBtn = screen.getByLabelText('Duplicate Default');
      fireEvent.click(duplicateBtn);

      const activeWs = workspaceStore.state.workspaces[workspaceStore.state.active];
      expect(activeWs.name).toBe(`${DEFAULT_PRESET.name} (Copy)`);
      expect(screen.getByTitle(`Workspace Layout: ${DEFAULT_PRESET.name} (Copy)`)).toBeDefined();
    });

    it('supports actions on custom layouts to rename, duplicate, and delete via dropdown', () => {
      // Create a custom workspace
      let customWsId = '';
      act(() => {
        customWsId = workspaceActions.saveCurrentLayoutAs('Custom Studio');
      });

      render(<WorkspaceToolbar />);

      // Open dropdown
      const triggerBtn = screen.getByTitle('Workspace Layout: Custom Studio');
      fireEvent.click(triggerBtn);

      // Verify Rename, Duplicate, and Delete action buttons appear for Custom Studio
      expect(screen.getByLabelText('Rename Custom Studio')).toBeDefined();
      expect(screen.getByLabelText('Duplicate Custom Studio')).toBeDefined();
      expect(screen.getByLabelText('Delete Custom Studio')).toBeDefined();

      // Test Rename
      const renameBtn = screen.getByLabelText('Rename Custom Studio');
      fireEvent.click(renameBtn);

      expect(screen.getByText('Rename Layout')).toBeDefined();
      const input = screen.getByPlaceholderText('e.g. Studio Layout, Lyrics Focus...');
      expect((input as HTMLInputElement).value).toBe('Custom Studio');

      fireEvent.change(input, { target: { value: 'Studio Pro' } });
      const renameSubmitBtn = screen.getByRole('button', { name: 'Rename' });
      fireEvent.click(renameSubmitBtn);

      expect(workspaceStore.state.workspaces[customWsId].name).toBe('Studio Pro');
      expect(screen.getByTitle('Workspace Layout: Studio Pro')).toBeDefined();

      // Test Duplicate on custom layout via dropdown
      fireEvent.click(screen.getByTitle('Workspace Layout: Studio Pro'));
      const duplicateBtn = screen.getByLabelText('Duplicate Studio Pro');
      fireEvent.click(duplicateBtn);

      const activeWs = workspaceStore.state.workspaces[workspaceStore.state.active];
      expect(activeWs.name).toBe('Studio Pro (Copy)');
      expect(screen.getByTitle('Workspace Layout: Studio Pro (Copy)')).toBeDefined();

      // Test Delete on the duplicated layout
      fireEvent.click(screen.getByTitle('Workspace Layout: Studio Pro (Copy)'));
      const deleteBtn = screen.getByLabelText('Delete Studio Pro (Copy)');
      fireEvent.click(deleteBtn);

      // Verify duplicated layout was deleted and active switched back
      expect(workspaceStore.state.workspaces[activeWs.id]).toBeUndefined();
      expect(workspaceStore.state.active).toBe(DEFAULT_PRESET.id);
      expect(screen.getByTitle('Workspace Layout: Default')).toBeDefined();
    });
  });

  describe('Panel Shortcut Badges', () => {
    it('displays shortcut badges in the Add Panel menu', () => {
      render(<WorkspaceToolbar />);

      const addBtn = screen.getByText('Add Panel');
      fireEvent.click(addBtn);

      expect(screen.getByText('Available Panels')).toBeDefined();

      // Verify all specified shortcuts
      expect(screen.getByText('Alt + Q')).toBeDefined();
      expect(screen.getByText('Alt + L')).toBeDefined();
      expect(screen.getByText('Alt + P')).toBeDefined();
      expect(screen.getByText('Alt + V')).toBeDefined();
      expect(screen.getByText('Alt + N')).toBeDefined();
    });

    it('closes the Add Panel dropdown when clicking outside or pressing Escape', () => {
      render(<WorkspaceToolbar />);

      const addBtn = screen.getByText('Add Panel');
      fireEvent.click(addBtn);
      expect(screen.getByText('Available Panels')).toBeDefined();

      // Outside click closes it
      fireEvent.mouseDown(document.body);
      expect(screen.queryByText('Available Panels')).toBeNull();

      // Reopen and test Escape
      fireEvent.click(addBtn);
      expect(screen.getByText('Available Panels')).toBeDefined();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText('Available Panels')).toBeNull();
    });

    it('adds panel into existing TabGroup when target position is As Tab', () => {
      // Switch to MusicBee which has t_right_mb tab group
      workspaceActions.switchWorkspace(MUSICBEE_PRESET.id);
      render(<WorkspaceToolbar />);

      const addBtn = screen.getByText('Add Panel');
      fireEvent.click(addBtn);

      // Select "As Tab"
      const asTabBtn = screen.getByRole('button', { name: 'As Tab' });
      fireEvent.click(asTabBtn);

      // Add Visualizer
      const visualizerOption = screen.getByText('Visualizer');
      fireEvent.click(visualizerOption);

      const ws = workspaceStore.state.workspaces[MUSICBEE_PRESET.id];
      const visualizerPanel = Object.values(ws.panels).find((p) => p.type === 'visualizer');
      expect(visualizerPanel).toBeDefined();

      // Verify visualizer was added into t_right_mb
      const tabGroup = (ws.root as any).children[2];
      expect(tabGroup.kind).toBe('tabs');
      expect(tabGroup.tabs).toContain(visualizerPanel?.id);
    });

    it('gracefully tabs into right tab group when adding on the right and 4 columns already exist', () => {
      // Setup 4-column layout matching user screenshot:
      // Playlists | Main View | Now Playing | Tabs(Lyrics, Queue)
      workspaceActions.switchWorkspace(MUSICBEE_PRESET.id);
      workspaceActions.dispatchOp({
        t: 'panel.insert',
        type: 'now-playing',
        at: { k: 'split-into', targetPanelId: 'p_main_mb', axis: 'x', before: false }
      });

      const ws4 = workspaceStore.state.workspaces[MUSICBEE_PRESET.id];
      expect((ws4.root as any).children).toHaveLength(4);

      render(<WorkspaceToolbar />);

      const addBtn = screen.getByText('Add Panel');
      fireEvent.click(addBtn);

      // Target position is 'right' by default
      // Add Visualizer
      const visualizerOption = screen.getByText('Visualizer');
      fireEvent.click(visualizerOption);

      const wsAfter = workspaceStore.state.workspaces[MUSICBEE_PRESET.id];
      const visualizerPanel = Object.values(wsAfter.panels).find((p) => p.type === 'visualizer');
      expect(visualizerPanel).toBeDefined();

      // Should be tabbed into t_right_mb, preserving 4 columns and not crashing
      const rightCol = (wsAfter.root as any).children[3];
      expect(rightCol.kind).toBe('tabs');
      expect(rightCol.tabs).toContain(visualizerPanel?.id);
    });
  });
});
