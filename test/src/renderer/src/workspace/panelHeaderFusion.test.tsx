import { PanelFrame } from '@renderer/workspace/engine/PanelFrame';
// @vitest-environment jsdom
import { TabActionsContext } from '@renderer/workspace/engine/PanelHeaderContext';
import { PanelHeaderSlot } from '@renderer/workspace/engine/PanelHeaderSlot';
import { dndStore, workspaceActions, workspaceStore } from '@renderer/workspace/store';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpdateContextMenuData = vi.fn();

vi.mock('@renderer/hooks/useContextMenu', () => ({
  useContextMenu: () => ({
    updateContextMenuData: mockUpdateContextMenuData,
    handleContextMenuVisibilityUpdate: vi.fn()
  })
}));

describe('Panel Header Fusion & PanelHeaderSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dndStore.setState(() => ({
      isDragging: false,
      currentDrag: null,
      hoveredDropTarget: null,
      maximizedPanelId: null
    }));
  });

  describe('PanelHeaderSlot Registration & Lifecycle', () => {
    const TestPanel = ({ hasActions = true }: { hasActions?: boolean }) => (
      <div>
        <PanelHeaderSlot
          info={<span data-testid="test-info">Track #42</span>}
          actions={
            hasActions ? (
              <button data-testid="test-action-btn" type="button">
                Clear
              </button>
            ) : null
          }
          menu={() => [
            {
              label: 'Custom Action',
              icon: 'tune',
              handler: vi.fn()
            }
          ]}
        />
        <div>Panel Body</div>
      </div>
    );

    it('registers info and actions into the fused 28px header', () => {
      render(
        <PanelFrame panelId="p_test" type="queue" title="Queue" icon="queue_music">
          <TestPanel />
        </PanelFrame>
      );

      // Verify header is 28px height class (h-7)
      const header =
        screen.getByRole('banner', { hidden: true }) || screen.getByText('Queue').closest('header');
      expect(header).toBeDefined();
      expect(header?.classList.contains('h-7')).toBe(true);

      // Verify identity
      expect(screen.getByText('Queue')).toBeDefined();
      expect(screen.getByText('queue_music')).toBeDefined();

      // Verify dynamic info and actions injected via slot
      expect(screen.getByTestId('test-info').textContent).toBe('Track #42');
      expect(screen.getByTestId('test-action-btn')).toBeDefined();
    });

    it('cleans up header fragment on unmount', () => {
      const TogglePanel = () => {
        const [mounted, setMounted] = useState(true);
        return (
          <div>
            <button data-testid="toggle-slot" type="button" onClick={() => setMounted(false)}>
              Unmount
            </button>
            {mounted && <TestPanel />}
          </div>
        );
      };

      render(
        <PanelFrame panelId="p_test" type="queue" title="Queue" icon="queue_music">
          <TogglePanel />
        </PanelFrame>
      );

      expect(screen.getByTestId('test-info')).toBeDefined();

      act(() => {
        fireEvent.click(screen.getByTestId('toggle-slot'));
      });

      // Fragment should be cleaned up
      expect(screen.queryByTestId('test-info')).toBeNull();
      expect(screen.queryByTestId('test-action-btn')).toBeNull();
    });
  });

  describe('Gesture & Interaction Guards', () => {
    it('does not toggle maximize when double-clicking interactive buttons or links', () => {
      render(
        <PanelFrame panelId="p_test" type="queue" title="Queue" icon="queue_music">
          <PanelHeaderSlot
            actions={
              <button data-testid="interactive-action" type="button">
                Action
              </button>
            }
          />
        </PanelFrame>
      );

      const actionBtn = screen.getByTestId('interactive-action');

      act(() => {
        fireEvent.doubleClick(actionBtn);
      });
      // Should NOT maximize
      expect(dndStore.state.maximizedPanelId).toBeNull();

      // Double-clicking header text or background DOES toggle maximize
      const header = screen.getByText('Queue').closest('header')!;
      act(() => {
        fireEvent.doubleClick(header);
      });
      expect(dndStore.state.maximizedPanelId).toBe('p_test');
    });

    it('does not initiate drag or attach listeners when pointer down occurs on interactive elements', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      render(
        <PanelFrame panelId="p_test" type="queue" title="Queue" icon="queue_music">
          <PanelHeaderSlot
            actions={
              <button data-testid="btn-guard" type="button">
                Click me
              </button>
            }
          />
        </PanelFrame>
      );

      const btn = screen.getByTestId('btn-guard');
      addEventListenerSpy.mockClear();

      fireEvent.pointerDown(btn, { button: 0, clientX: 10, clientY: 10 });
      // Drag hook attaches window pointermove and pointerup ONLY if pointerDown passed guard
      const attachedPointerMoves = addEventListenerSpy.mock.calls.filter(
        ([evt]) => evt === 'pointermove'
      );
      expect(attachedPointerMoves).toHaveLength(0);

      // Now pointerdown on the non-interactive header background
      const header = screen.getByText('Queue').closest('header')!;
      fireEvent.pointerDown(header, { button: 0, clientX: 10, clientY: 10 });
      const attachedAfterHeader = addEventListenerSpy.mock.calls.filter(
        ([evt]) => evt === 'pointermove'
      );
      expect(attachedAfterHeader.length).toBeGreaterThan(0);

      addEventListenerSpy.mockRestore();
    });

    it('prevents drag when panel is already maximized', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      dndStore.setState((s) => ({ ...s, maximizedPanelId: 'p_test' }));

      render(
        <PanelFrame panelId="p_test" type="queue" title="Queue" icon="queue_music">
          <div>Maximized content</div>
        </PanelFrame>
      );

      const header = screen.getByText('Queue').closest('header')!;
      expect(header.classList.contains('cursor-default')).toBe(true);

      addEventListenerSpy.mockClear();
      fireEvent.pointerDown(header, { button: 0, clientX: 10, clientY: 10 });

      const attachedPointerMoves = addEventListenerSpy.mock.calls.filter(
        ([evt]) => evt === 'pointermove'
      );
      expect(attachedPointerMoves).toHaveLength(0);

      addEventListenerSpy.mockRestore();
    });
  });

  describe('Caret Button & Context Menu Triggers', () => {
    it('opens context menu with merged frame + panel contributions via caret button', () => {
      const customHandler = vi.fn();

      render(
        <PanelFrame panelId="p_test" type="queue" title="Queue" icon="queue_music">
          <PanelHeaderSlot
            menu={() => [
              {
                label: 'Clear All Songs',
                icon: 'clear_all',
                handler: customHandler
              }
            ]}
          />
        </PanelFrame>
      );

      const caretBtn = screen.getByTitle('Panel options');
      expect(caretBtn.getAttribute('aria-haspopup')).toBe('menu');

      act(() => {
        fireEvent.click(caretBtn);
      });

      expect(mockUpdateContextMenuData).toHaveBeenCalledOnce();
      const [isOpen, items] = mockUpdateContextMenuData.mock.calls[0];
      expect(isOpen).toBe(true);
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Maximize Panel', iconName: 'open_in_full' }),
          expect.objectContaining({ label: 'Clear All Songs', iconName: 'clear_all' }),
          expect.objectContaining({ label: 'Close Panel', iconName: 'close' })
        ])
      );
    });

    it('opens context menu with merged items on right-click of header', () => {
      render(
        <PanelFrame panelId="p_test" type="lyrics" title="Lyrics" icon="lyrics" canClose={false}>
          <PanelHeaderSlot
            menu={() => [
              {
                label: 'Auto-scroll',
                icon: 'swap_vert',
                handler: vi.fn()
              }
            ]}
          />
        </PanelFrame>
      );

      const header = screen.getByText('Lyrics').closest('header')!;
      act(() => {
        const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'pageX', { value: 100 });
        Object.defineProperty(ev, 'pageY', { value: 200 });
        header.dispatchEvent(ev);
      });

      expect(mockUpdateContextMenuData).toHaveBeenCalledOnce();
      const [isOpen, items, pageX, pageY] = mockUpdateContextMenuData.mock.calls[0];
      expect(isOpen).toBe(true);
      expect(pageX).toBe(100);
      expect(pageY).toBe(212); // pageY + 12 offset
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Maximize Panel' }),
          expect.objectContaining({ label: 'Auto-scroll' })
        ])
      );
      // canClose is false -> no Close Panel item
      expect(items.some((i: { label: string }) => i.label === 'Close Panel')).toBe(false);
    });
  });

  describe('Tab Strip Portaling (showHeader=false)', () => {
    it('portals header actions and info to TabGroup target when active in tab group', () => {
      const portalTarget = document.createElement('div');
      portalTarget.setAttribute('data-testid', 'tab-actions-target');
      document.body.appendChild(portalTarget);

      const tabContextValue = {
        target: portalTarget,
        activePanelId: 'p_active'
      };

      render(
        <TabActionsContext.Provider value={tabContextValue}>
          <PanelFrame
            panelId="p_active"
            type="queue"
            title="Queue"
            icon="queue_music"
            showHeader={false}
          >
            <PanelHeaderSlot
              info={<span data-testid="portaled-info">5 tracks</span>}
              actions={
                <button data-testid="portaled-clear-btn" type="button">
                  Clear
                </button>
              }
            />
          </PanelFrame>
        </TabActionsContext.Provider>
      );

      // Frame header itself should NOT be rendered when showHeader={false}
      expect(screen.queryByRole('banner')).toBeNull();

      // Fragment should be portaled into portalTarget
      expect(portalTarget.querySelector('[data-testid="portaled-info"]')?.textContent).toBe(
        '5 tracks'
      );
      expect(portalTarget.querySelector('[data-testid="portaled-clear-btn"]')).toBeDefined();

      document.body.removeChild(portalTarget);
    });

    it('does NOT portal actions when panel is inactive in tab group', () => {
      const portalTarget = document.createElement('div');
      document.body.appendChild(portalTarget);

      const tabContextValue = {
        target: portalTarget,
        activePanelId: 'p_other' // Inactive!
      };

      render(
        <TabActionsContext.Provider value={tabContextValue}>
          <PanelFrame
            panelId="p_inactive"
            type="queue"
            title="Queue"
            icon="queue_music"
            showHeader={false}
          >
            <PanelHeaderSlot
              info={<span data-testid="inactive-info">5 tracks</span>}
              actions={
                <button data-testid="inactive-clear-btn" type="button">
                  Clear
                </button>
              }
            />
          </PanelFrame>
        </TabActionsContext.Provider>
      );

      expect(portalTarget.querySelector('[data-testid="inactive-info"]')).toBeNull();
      expect(portalTarget.querySelector('[data-testid="inactive-clear-btn"]')).toBeNull();

      document.body.removeChild(portalTarget);
    });
  });
});
