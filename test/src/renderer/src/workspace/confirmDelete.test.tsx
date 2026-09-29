// @vitest-environment jsdom
import { DEFAULT_PRESET } from '@renderer/workspace/presets/default';
import { MUSICBEE_PRESET } from '@renderer/workspace/presets/musicbee';
import { dndStore, workspaceActions, workspaceStore } from '@renderer/workspace/store';
import type { Workspace } from '@renderer/workspace/types';
import { ConfirmDeleteModal } from '@renderer/workspace/ui/ConfirmDeleteModal';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

describe('ConfirmDeleteModal Component', () => {
  const customWs: Workspace = {
    id: 'ws_custom_delete_test',
    name: 'Custom To Delete',
    schemaVersion: 2,
    frame: { playerBar: 'bottom', playerBarCompact: false },
    root: { kind: 'panel', panel: 'p_router_del' },
    panels: {
      p_router_del: { id: 'p_router_del', type: 'router-view', local: {} }
    }
  };

  beforeEach(() => {
    workspaceStore.setState(() => ({
      active: DEFAULT_PRESET.id,
      workspaces: {
        [DEFAULT_PRESET.id]: JSON.parse(JSON.stringify(DEFAULT_PRESET)),
        [MUSICBEE_PRESET.id]: JSON.parse(JSON.stringify(MUSICBEE_PRESET)),
        [customWs.id]: JSON.parse(JSON.stringify(customWs))
      }
    }));

    workspaceActions.closeDeleteConfirmModal();
  });

  it('renders nothing when modal is not open', () => {
    const { container } = render(<ConfirmDeleteModal />);
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with target workspace name when opened', () => {
    render(<ConfirmDeleteModal />);

    act(() => {
      workspaceActions.openDeleteConfirmModal(customWs.id);
    });

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Delete Workspace')).toBeDefined();
    expect(screen.getByText(/Custom To Delete/)).toBeDefined();
  });

  it('displays active workspace switch warning when target is active workspace', () => {
    workspaceStore.setState((s) => ({ ...s, active: customWs.id }));
    render(<ConfirmDeleteModal />);

    act(() => {
      workspaceActions.openDeleteConfirmModal(customWs.id);
    });

    expect(
      screen.getByText(/This is your currently active layout\. Nora will switch to the/)
    ).toBeDefined();
  });

  it('does not display active workspace switch warning when target is not active', () => {
    workspaceStore.setState((s) => ({ ...s, active: DEFAULT_PRESET.id }));
    render(<ConfirmDeleteModal />);

    act(() => {
      workspaceActions.openDeleteConfirmModal(customWs.id);
    });

    expect(
      screen.queryByText(/This is your currently active layout\. Nora will switch to the/)
    ).toBeNull();
  });

  it('closes modal without deleting when Cancel button is clicked', () => {
    render(<ConfirmDeleteModal />);

    act(() => {
      workspaceActions.openDeleteConfirmModal(customWs.id);
    });
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    expect(dndStore.state.isDeleteConfirmModalOpen).toBe(false);
    expect(workspaceStore.state.workspaces[customWs.id]).toBeDefined();
  });

  it('closes modal on Escape key press without deleting', () => {
    render(<ConfirmDeleteModal />);

    act(() => {
      workspaceActions.openDeleteConfirmModal(customWs.id);
    });
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(dndStore.state.isDeleteConfirmModalOpen).toBe(false);
    expect(workspaceStore.state.workspaces[customWs.id]).toBeDefined();
  });

  it('closes modal on backdrop click', () => {
    render(<ConfirmDeleteModal />);

    act(() => {
      workspaceActions.openDeleteConfirmModal(customWs.id);
    });
    const backdrop = screen.getByRole('presentation');
    fireEvent.click(backdrop);

    expect(dndStore.state.isDeleteConfirmModalOpen).toBe(false);
  });

  it('deletes workspace and closes modal when Delete button is clicked', () => {
    workspaceStore.setState((s) => ({ ...s, active: customWs.id }));
    render(<ConfirmDeleteModal />);

    act(() => {
      workspaceActions.openDeleteConfirmModal(customWs.id);
    });
    const deleteBtn = screen.getByRole('button', { name: 'Delete Layout' });
    fireEvent.click(deleteBtn);

    expect(dndStore.state.isDeleteConfirmModalOpen).toBe(false);
    expect(workspaceStore.state.workspaces[customWs.id]).toBeUndefined();
    expect(workspaceStore.state.active).toBe(DEFAULT_PRESET.id);
  });

  it('does not open delete modal for protected default presets', () => {
    render(<ConfirmDeleteModal />);

    workspaceActions.openDeleteConfirmModal(DEFAULT_PRESET.id);
    expect(dndStore.state.isDeleteConfirmModalOpen).toBe(false);

    workspaceActions.openDeleteConfirmModal(MUSICBEE_PRESET.id);
    expect(dndStore.state.isDeleteConfirmModalOpen).toBe(false);
  });

  it('traps Tab focus inside the dialog', () => {
    render(<ConfirmDeleteModal />);

    act(() => {
      workspaceActions.openDeleteConfirmModal(customWs.id);
    });

    const dialog = screen.getByRole('dialog');
    const focusable = dialog.querySelectorAll<HTMLElement>('button:not([disabled])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first.focus();
    expect(document.activeElement).toBe(first);

    // Shift+Tab from first wraps to last
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    // Tab from last wraps to first
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(first);
  });
});
