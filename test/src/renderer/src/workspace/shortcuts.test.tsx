// @vitest-environment jsdom
import { useWorkspaceShortcuts } from '@renderer/workspace/engine/useWorkspaceShortcuts';
import { dndStore, workspaceActions, workspaceStore } from '@renderer/workspace/store';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('useWorkspaceShortcuts Hook', () => {
  beforeEach(() => {
    dndStore.setState(() => ({
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Alt Panel Shortcuts Delegation', () => {
    it('does not intercept Alt shortcuts, delegating them to global useKeyboardShortcuts', () => {
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      const modalSpy = vi
        .spyOn(workspaceActions, 'openSaveLayoutModal')
        .mockImplementation(() => {});
      const { unmount } = renderHook(() => useWorkspaceShortcuts());

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', altKey: true }));

      expect(spy).not.toHaveBeenCalled();
      expect(modalSpy).not.toHaveBeenCalled();

      unmount();
    });
  });

  describe('Escape Key Handling', () => {
    it('restores from maximized panel when Escape is pressed', () => {
      const spy = vi.spyOn(workspaceActions, 'setMaximizedPanel').mockImplementation(() => {});
      dndStore.setState((s) => ({ ...s, maximizedPanelId: 'p_max' }));

      const { unmount } = renderHook(() => useWorkspaceShortcuts());

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(spy).toHaveBeenCalledWith(null);

      unmount();
    });

    it('closes save layout modal when Escape is pressed', () => {
      const spy = vi.spyOn(workspaceActions, 'closeSaveLayoutModal').mockImplementation(() => {});
      dndStore.setState((s) => ({ ...s, isSaveLayoutModalOpen: true }));

      const { unmount } = renderHook(() => useWorkspaceShortcuts());

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(spy).toHaveBeenCalled();

      unmount();
    });

    it('closes delete confirm modal when Escape is pressed', () => {
      const spy = vi
        .spyOn(workspaceActions, 'closeDeleteConfirmModal')
        .mockImplementation(() => {});
      dndStore.setState((s) => ({ ...s, isDeleteConfirmModalOpen: true }));

      const { unmount } = renderHook(() => useWorkspaceShortcuts());

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(spy).toHaveBeenCalled();

      unmount();
    });
  });

  describe('Ctrl+Alt+M Maximize Shortcut Handling (CF-05)', () => {
    it('un-maximizes when a panel is currently maximized', () => {
      const spy = vi.spyOn(workspaceActions, 'setMaximizedPanel').mockImplementation(() => {});
      dndStore.setState((s) => ({ ...s, maximizedPanelId: 'p_max' }));

      const { unmount } = renderHook(() => useWorkspaceShortcuts());

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, altKey: true, cancelable: true })
      );
      expect(spy).toHaveBeenCalledWith(null);

      unmount();
    });

    it('maximizes focused panel if active element is inside data-panel-id', () => {
      const toggleSpy = vi
        .spyOn(workspaceActions, 'toggleMaximizePanel')
        .mockImplementation(() => {});

      const panelDiv = document.createElement('div');
      panelDiv.setAttribute('data-panel-id', 'test-panel-queue');
      const innerButton = document.createElement('button');
      panelDiv.appendChild(innerButton);
      document.body.appendChild(panelDiv);
      innerButton.focus();

      const { unmount } = renderHook(() => useWorkspaceShortcuts());

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, altKey: true, cancelable: true })
      );
      expect(toggleSpy).toHaveBeenCalledWith('test-panel-queue');

      unmount();
      document.body.removeChild(panelDiv);
    });

    it('falls back to maximizing router-view if no panel is focused', () => {
      const toggleSpy = vi
        .spyOn(workspaceActions, 'toggleMaximizePanel')
        .mockImplementation(() => {});

      const { unmount } = renderHook(() => useWorkspaceShortcuts());

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, altKey: true, cancelable: true })
      );
      const activeWs = workspaceStore.state.workspaces[workspaceStore.state.active];
      const routerPanel = Object.values(activeWs.panels).find((p) => p.type === 'router-view');
      expect(toggleSpy).toHaveBeenCalledWith(routerPanel?.id);

      unmount();
    });
  });

  describe('Input Element Guard', () => {
    function TestComponent() {
      useWorkspaceShortcuts();
      return (
        <div>
          <input data-testid="test-input" type="text" />
          <textarea data-testid="test-textarea" />
          <select data-testid="test-select">
            <option value="1">1</option>
          </select>
          <div data-testid="test-editable" contentEditable suppressContentEditableWarning>
            Editable text
          </div>
        </div>
      );
    }

    it('ignores Alt shortcuts when target is an input', () => {
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      const { getByTestId } = render(<TestComponent />);

      const input = getByTestId('test-input');
      fireEvent.keyDown(input, { key: 'q', altKey: true });
      expect(spy).not.toHaveBeenCalled();
    });

    it('ignores Alt shortcuts when target is a textarea', () => {
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      const { getByTestId } = render(<TestComponent />);

      const textarea = getByTestId('test-textarea');
      fireEvent.keyDown(textarea, { key: 'l', altKey: true });
      expect(spy).not.toHaveBeenCalled();
    });

    it('ignores Alt shortcuts when target is a select', () => {
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      const { getByTestId } = render(<TestComponent />);

      const select = getByTestId('test-select');
      fireEvent.keyDown(select, { key: 'p', altKey: true });
      expect(spy).not.toHaveBeenCalled();
    });

    it('ignores Alt shortcuts when target is contentEditable', () => {
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      const { getByTestId } = render(<TestComponent />);

      const editable = getByTestId('test-editable');
      fireEvent.keyDown(editable, { key: 'v', altKey: true });
      expect(spy).not.toHaveBeenCalled();
    });

    it('ignores Escape when target is an input element', () => {
      const maxSpy = vi.spyOn(workspaceActions, 'setMaximizedPanel').mockImplementation(() => {});
      dndStore.setState((s) => ({ ...s, maximizedPanelId: 'p_max' }));

      const { getByTestId } = render(<TestComponent />);
      const input = getByTestId('test-input');

      fireEvent.keyDown(input, { key: 'Escape' });
      expect(maxSpy).not.toHaveBeenCalled();
    });

    it('ignores Ctrl+Z, Ctrl+Y, and Ctrl+1 when target is an input element', () => {
      const undoSpy = vi.spyOn(workspaceActions, 'undo').mockReturnValue(true);
      const redoSpy = vi.spyOn(workspaceActions, 'redo').mockReturnValue(true);
      const switchSpy = vi.spyOn(workspaceActions, 'switchWorkspace').mockImplementation(() => {});

      const { getByTestId } = render(<TestComponent />);
      const input = getByTestId('test-input');

      fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
      fireEvent.keyDown(input, { key: 'y', ctrlKey: true });
      fireEvent.keyDown(input, { key: '1', code: 'Digit1', ctrlKey: true });

      expect(undoSpy).not.toHaveBeenCalled();
      expect(redoSpy).not.toHaveBeenCalled();
      expect(switchSpy).not.toHaveBeenCalled();
    });
  });

  describe('Undo / Redo Shortcuts', () => {
    it('calls workspaceActions.undo on Ctrl+Z and Cmd+Z', () => {
      const undoSpy = vi.spyOn(workspaceActions, 'undo').mockReturnValue(true);
      const { unmount } = renderHook(() => useWorkspaceShortcuts());

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true })
      );
      expect(undoSpy).toHaveBeenCalledTimes(1);

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', metaKey: true, cancelable: true })
      );
      expect(undoSpy).toHaveBeenCalledTimes(2);

      unmount();
    });

    it('calls workspaceActions.redo on Ctrl+Shift+Z, Cmd+Shift+Z, and Ctrl+Y', () => {
      const redoSpy = vi.spyOn(workspaceActions, 'redo').mockReturnValue(true);
      const { unmount } = renderHook(() => useWorkspaceShortcuts());

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, cancelable: true })
      );
      expect(redoSpy).toHaveBeenCalledTimes(1);

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, cancelable: true })
      );
      expect(redoSpy).toHaveBeenCalledTimes(2);

      unmount();
    });
  });

  describe('Direct Workspace Switching Shortcuts (Ctrl+1..9)', () => {
    it('switches to workspace by 1-based index', () => {
      const switchSpy = vi.spyOn(workspaceActions, 'switchWorkspace').mockImplementation(() => {});
      const { unmount } = renderHook(() => useWorkspaceShortcuts());

      // Ctrl+1 should switch to first workspace
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '1', code: 'Digit1', ctrlKey: true, cancelable: true })
      );
      const workspaceIds = Object.keys(workspaceStore.state.workspaces);
      expect(switchSpy).toHaveBeenCalledWith(workspaceIds[0]);

      // Ctrl+2 should switch to second workspace
      if (workspaceIds.length > 1) {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: '2',
            code: 'Digit2',
            ctrlKey: true,
            cancelable: true
          })
        );
        expect(switchSpy).toHaveBeenCalledWith(workspaceIds[1]);
      }

      unmount();
    });

    it('ignores digit shortcut if index is out of bounds', () => {
      const switchSpy = vi.spyOn(workspaceActions, 'switchWorkspace').mockImplementation(() => {});
      const { unmount } = renderHook(() => useWorkspaceShortcuts());

      // Ctrl+9 when only 2 workspaces exist
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '9', code: 'Digit9', ctrlKey: true, cancelable: true })
      );
      expect(switchSpy).not.toHaveBeenCalled();

      unmount();
    });
  });

  describe('Unmount cleanup', () => {
    it('removes event listener on unmount', () => {
      const spy = vi.spyOn(workspaceActions, 'toggleOrOpenPanel').mockImplementation(() => {});
      const { unmount } = renderHook(() => useWorkspaceShortcuts());

      unmount();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', altKey: true }));
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
