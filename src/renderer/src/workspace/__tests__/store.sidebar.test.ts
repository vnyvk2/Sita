// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { dndStore, workspaceActions } from '../store';

describe('Workspace Store Sidebar State & Actions', () => {
  beforeEach(() => {
    localStorage.clear();
    dndStore.setState((s) => ({
      ...s,
      isSidebarPinned: true,
      isSidebarPeeking: false,
      sidebarWidthMode: 'expanded',
      sidebarMode: 'expanded'
    }));
  });

  it('cycles sidebar mode strictly between expanded and compact (no 3-way cycle)', () => {
    expect(dndStore.state.sidebarWidthMode).toBe('expanded');

    // First cycle: expanded -> compact
    workspaceActions.cycleSidebarMode();
    expect(dndStore.state.sidebarWidthMode).toBe('compact');
    expect(dndStore.state.sidebarMode).toBe('compact');
    expect(localStorage.getItem('nora:sidebar-width-mode')).toBe('compact');

    // Second cycle: compact -> expanded (strictly 2 states, does NOT go to hidden)
    workspaceActions.cycleSidebarMode();
    expect(dndStore.state.sidebarWidthMode).toBe('expanded');
    expect(dndStore.state.sidebarMode).toBe('expanded');
    expect(localStorage.getItem('nora:sidebar-width-mode')).toBe('expanded');
  });

  it('toggles pinned state and updates visibility mode accordingly', () => {
    expect(dndStore.state.isSidebarPinned).toBe(true);

    // Unpin: hides sidebar
    workspaceActions.toggleSidebarPinned();
    expect(dndStore.state.isSidebarPinned).toBe(false);
    expect(dndStore.state.sidebarMode).toBe('hidden');
    expect(localStorage.getItem('nora:sidebar-pinned')).toBe('false');

    // Re-pin: restores to current width mode
    workspaceActions.toggleSidebarPinned();
    expect(dndStore.state.isSidebarPinned).toBe(true);
    expect(dndStore.state.sidebarMode).toBe('expanded');
    expect(localStorage.getItem('nora:sidebar-pinned')).toBe('true');
  });

  it('handles peeking mode when unpinned', () => {
    // Unpin sidebar
    workspaceActions.setSidebarPinned(false);
    expect(dndStore.state.sidebarMode).toBe('hidden');

    // Open peek
    workspaceActions.setSidebarPeeking(true);
    expect(dndStore.state.isSidebarPeeking).toBe(true);
    expect(dndStore.state.sidebarMode).toBe('expanded');

    // Close peek
    workspaceActions.setSidebarPeeking(false);
    expect(dndStore.state.isSidebarPeeking).toBe(false);
    expect(dndStore.state.sidebarMode).toBe('hidden');
  });

  it('preserves compact width mode when peeking unpinned', () => {
    workspaceActions.setSidebarWidthMode('compact');
    workspaceActions.setSidebarPinned(false);

    expect(dndStore.state.sidebarMode).toBe('hidden');
    expect(dndStore.state.sidebarWidthMode).toBe('compact');

    // Open peek -> peeks in compact width
    workspaceActions.setSidebarPeeking(true);
    expect(dndStore.state.isSidebarPeeking).toBe(true);
    expect(dndStore.state.sidebarMode).toBe('compact');
  });

  it('clears peeking and settles into docked mode when pinned while peeking', () => {
    workspaceActions.setSidebarPinned(false);
    workspaceActions.setSidebarPeeking(true);
    expect(dndStore.state.isSidebarPeeking).toBe(true);

    // User clicks pin while peeking
    workspaceActions.setSidebarPinned(true);
    expect(dndStore.state.isSidebarPinned).toBe(true);
    expect(dndStore.state.isSidebarPeeking).toBe(false);
    expect(dndStore.state.sidebarMode).toBe('expanded');
  });
});
