// @vitest-environment jsdom
import { useWorkspaceShortcuts } from '@renderer/workspace/engine/useWorkspaceShortcuts';
import { dndStore, workspaceActions } from '@renderer/workspace/store';
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
      const modalSpy = vi.spyOn(workspaceActions, 'openSaveLayoutModal').mockImplementation(() => {});
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
