import { NodeView } from '@renderer/workspace/engine/NodeView';
import { PanelErrorBoundary } from '@renderer/workspace/engine/PanelErrorBoundary';
import { PanelFrame } from '@renderer/workspace/engine/PanelFrame';
import { PanelSkeleton } from '@renderer/workspace/engine/PanelSkeleton';
import { TabGroup } from '@renderer/workspace/engine/TabGroup';
import { WorkspaceController } from '@renderer/workspace/engine/WorkspaceController';
import { getInitialWorkspaceState } from '@renderer/workspace/persistence';
import { DEFAULT_PRESET } from '@renderer/workspace/presets/default';
import { MUSICBEE_PRESET } from '@renderer/workspace/presets/musicbee';
import { dndStore, workspaceStore } from '@renderer/workspace/store';
import type { SplitNode, TabGroupNode } from '@renderer/workspace/types';
// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Workspace Engine Components', () => {
  beforeEach(() => {
    workspaceStore.setState(() => getInitialWorkspaceState());
    dndStore.setState(() => ({
      isDragging: false,
      currentDrag: null,
      hoveredDropTarget: null,
      maximizedPanelId: null
    }));
  });

  describe('PanelSkeleton', () => {
    it('renders with title', () => {
      const { container } = render(<PanelSkeleton title="Test Panel" />);
      expect(container.textContent).toContain('Test Panel');
    });
  });

  describe('PanelErrorBoundary', () => {
    const ProblemChild = () => {
      throw new Error('Simulated panel explosion');
    };

    it('catches render errors and renders fallback UI with retry button', () => {
      // Suppress console.error during expected error boundary test
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const onClose = vi.fn();
      render(
        <PanelErrorBoundary
          panelId="p_test"
          panelTitle="Test Exploding Panel"
          canClose={true}
          onClose={onClose}
        >
          <ProblemChild />
        </PanelErrorBoundary>
      );

      expect(screen.getByText('Panel Error')).toBeDefined();
      expect(screen.getByText(/Simulated panel explosion/)).toBeDefined();

      const closeBtn = screen.getByRole('button', { name: 'Close' });
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledOnce();

      spy.mockRestore();
    });
  });

  describe('PanelFrame', () => {
    it('renders title, icon, and handles maximize toggle on double click', () => {
      render(
        <PanelFrame panelId="p_test" type="queue" title="Queue View" icon="queue_music">
          <div>Panel Content</div>
        </PanelFrame>
      );

      expect(screen.getByText('Queue View')).toBeDefined();
      expect(screen.getByText('queue_music')).toBeDefined();
      expect(screen.getByText('Panel Content')).toBeDefined();

      const header = screen.getByText('Queue View').closest('header')!;
      act(() => {
        fireEvent.doubleClick(header);
      });
      expect(dndStore.state.maximizedPanelId).toBe('p_test');

      act(() => {
        fireEvent.doubleClick(header);
      });
      expect(dndStore.state.maximizedPanelId).toBeNull();
    });
  });

  describe('TabGroup', () => {
    it('renders tabs list and switches active tab on click', () => {
      const tabNode: TabGroupNode = {
        kind: 'tabs',
        id: 't_right_mb',
        tabs: ['p_lyrics_mb', 'p_queue_mb'],
        active: 'p_lyrics_mb'
      };

      workspaceStore.setState(() => ({
        active: MUSICBEE_PRESET.id,
        workspaces: {
          [MUSICBEE_PRESET.id]: MUSICBEE_PRESET
        }
      }));

      render(<TabGroup node={tabNode} />);

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(2);
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');

      act(() => {
        fireEvent.click(tabs[1]);
      });
      const activeWs = workspaceStore.state.workspaces[MUSICBEE_PRESET.id];
      const currentTabNode = (activeWs.root as SplitNode).children[2] as TabGroupNode;
      expect(currentTabNode.active).toBe('p_queue_mb');
    });
  });

  describe('NodeView and WorkspaceController', () => {
    it('renders DEFAULT_PRESET layout without throwing', () => {
      const { container } = render(<NodeView node={DEFAULT_PRESET.root} />);
      expect(container.querySelector('.split-view')).toBeDefined();
    });

    it('renders WorkspaceController and full-bleed maximized view when maximizedPanelId is set', () => {
      render(<WorkspaceController />);
      expect(document.querySelector('.workspace-controller')).toBeDefined();

      act(() => {
        dndStore.setState((s) => ({ ...s, maximizedPanelId: 'p_main_default' }));
      });
      expect(document.querySelector('.maximized-panel-overlay')).toBeDefined();
    });
  });

  describe('SplitView Divider Dragging (CF-02 Regression)', () => {
    it('preserves untouched sibling weights when dragging divider in a 3-way split', () => {
      const splitNode: SplitNode = {
        kind: 'split',
        id: 'split_test_3way',
        axis: 'x',
        children: [
          { kind: 'panel', panel: 'p_left' },
          { kind: 'panel', panel: 'p_center' },
          { kind: 'panel', panel: 'p_right' }
        ],
        weights: [0.11, 0.64, 0.25]
      };

      workspaceStore.setState(() => ({
        active: 'ws_test',
        workspaces: {
          ws_test: {
            id: 'ws_test',
            name: 'Test Workspace',
            schemaVersion: 2,
            root: splitNode,
            panels: {
              p_left: { id: 'p_left', type: 'playlists', local: {} },
              p_center: { id: 'p_center', type: 'router-view', local: {} },
              p_right: { id: 'p_right', type: 'lyrics', local: {} }
            },
            frame: { playerBar: 'bottom', playerBarCompact: false }
          }
        }
      }));

      const { container } = render(<NodeView node={splitNode} />);
      const dividers = container.querySelectorAll('.split-divider');
      expect(dividers).toHaveLength(2);

      const slots = container.querySelectorAll('.slot-container');
      expect(slots).toHaveLength(3);

      // Mock getBoundingClientRect for slots: slot0 = 110px, slot1 = 640px, slot2 = 250px
      vi.spyOn(slots[0], 'getBoundingClientRect').mockReturnValue({
        width: 110,
        height: 600,
        top: 0,
        left: 0,
        right: 110,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => {}
      });
      vi.spyOn(slots[1], 'getBoundingClientRect').mockReturnValue({
        width: 640,
        height: 600,
        top: 0,
        left: 110,
        right: 750,
        bottom: 600,
        x: 110,
        y: 0,
        toJSON: () => {}
      });
      vi.spyOn(slots[2], 'getBoundingClientRect').mockReturnValue({
        width: 250,
        height: 600,
        top: 0,
        left: 750,
        right: 1000,
        bottom: 600,
        x: 750,
        y: 0,
        toJSON: () => {}
      });

      const divider0 = dividers[0] as HTMLDivElement;
      // Mock setPointerCapture / releasePointerCapture in jsdom
      divider0.setPointerCapture = vi.fn();
      divider0.releasePointerCapture = vi.fn();

      // Drag divider 0 by +40px (from clientX 110 to 150)
      act(() => {
        fireEvent.pointerDown(divider0, {
          pointerId: 1,
          clientX: 110,
          clientY: 300,
          button: 0
        });
      });

      act(() => {
        divider0.dispatchEvent(
          new PointerEvent('pointermove', {
            pointerId: 1,
            clientX: 150,
            clientY: 300
          })
        );
      });

      // Verify that DOM styles during drag are in fractional domain (not crushed!)
      // pairWeight = 0.75, newSizeA = 150, totalPair = 750 -> ratio = 150/750 = 0.2 -> newWeightA = 0.15, newWeightB = 0.60
      expect((slots[0] as HTMLElement).style.flexGrow).toBe('0.15');
      expect((slots[1] as HTMLElement).style.flexGrow).toBe('0.6');
      // slot 2 flexGrow MUST NOT be crushed to near-zero; it retains its fractional JSX style
      expect((slots[2] as HTMLElement).style.flexGrow).toBe('0.25');

      // Release divider
      act(() => {
        divider0.dispatchEvent(
          new PointerEvent('pointerup', {
            pointerId: 1
          })
        );
      });

      // Verify committed workspace weights in store:
      const updatedWs = workspaceStore.state.workspaces.ws_test;
      const updatedRoot = updatedWs.root as SplitNode;
      expect(updatedRoot.weights).toBeDefined();
      expect(updatedRoot.weights[0]).toBeCloseTo(0.15, 2);
      expect(updatedRoot.weights[1]).toBeCloseTo(0.6, 2);
      // Untouched sibling MUST preserve exact weight 0.25 (not crushed to 0.001!)
      expect(updatedRoot.weights[2]).toBe(0.25);
    });

    it('clamps slot sizes to minSlotSize during extreme dragging and preserves untouched siblings', () => {
      const splitNode: SplitNode = {
        kind: 'split',
        id: 'split_test_clamp',
        axis: 'x',
        children: [
          { kind: 'panel', panel: 'p_left' },
          { kind: 'panel', panel: 'p_center' },
          { kind: 'panel', panel: 'p_right' }
        ],
        weights: [0.11, 0.64, 0.25]
      };

      workspaceStore.setState(() => ({
        active: 'ws_clamp',
        workspaces: {
          ws_clamp: {
            id: 'ws_clamp',
            name: 'Clamp Workspace',
            schemaVersion: 2,
            root: splitNode,
            panels: {
              p_left: { id: 'p_left', type: 'playlists', local: {} },
              p_center: { id: 'p_center', type: 'router-view', local: {} },
              p_right: { id: 'p_right', type: 'lyrics', local: {} }
            },
            frame: { playerBar: 'bottom', playerBarCompact: false }
          }
        }
      }));

      const { container } = render(<NodeView node={splitNode} />);
      const dividers = container.querySelectorAll('.split-divider');
      const slots = container.querySelectorAll('.slot-container');

      vi.spyOn(slots[0], 'getBoundingClientRect').mockReturnValue({
        width: 110,
        height: 600,
        top: 0,
        left: 0,
        right: 110,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => {}
      });
      vi.spyOn(slots[1], 'getBoundingClientRect').mockReturnValue({
        width: 640,
        height: 600,
        top: 0,
        left: 110,
        right: 750,
        bottom: 600,
        x: 110,
        y: 0,
        toJSON: () => {}
      });
      vi.spyOn(slots[2], 'getBoundingClientRect').mockReturnValue({
        width: 250,
        height: 600,
        top: 0,
        left: 750,
        right: 1000,
        bottom: 600,
        x: 750,
        y: 0,
        toJSON: () => {}
      });

      const divider0 = dividers[0] as HTMLDivElement;
      divider0.setPointerCapture = vi.fn();
      divider0.releasePointerCapture = vi.fn();

      // Drag divider 0 way past the left edge (delta -500px)
      act(() => {
        fireEvent.pointerDown(divider0, {
          pointerId: 1,
          clientX: 110,
          clientY: 300,
          button: 0
        });
      });

      act(() => {
        divider0.dispatchEvent(
          new PointerEvent('pointermove', {
            pointerId: 1,
            clientX: -390, // 110 - 500
            clientY: 300
          })
        );
      });

      // Clamped to effectiveMin = 80px out of totalPair = 750px
      // ratio = 80 / 750 = 0.1067 -> weightA = 0.75 * 0.1067 = 0.08, weightB = 0.75 - 0.08 = 0.67
      expect((slots[0] as HTMLElement).style.flexGrow).toBe('0.08');
      expect((slots[1] as HTMLElement).style.flexGrow).toBe('0.67');
      expect((slots[2] as HTMLElement).style.flexGrow).toBe('0.25');

      act(() => {
        divider0.dispatchEvent(
          new PointerEvent('pointerup', {
            pointerId: 1
          })
        );
      });

      const updatedWs = workspaceStore.state.workspaces.ws_clamp;
      const updatedRoot = updatedWs.root as SplitNode;
      expect(updatedRoot.weights[0]).toBeCloseTo(0.08, 2);
      expect(updatedRoot.weights[1]).toBeCloseTo(0.67, 2);
      expect(updatedRoot.weights[2]).toBe(0.25);
    });

    it('preserves untouched outer siblings when dragging middle divider in a 4-way split', () => {
      const splitNode: SplitNode = {
        kind: 'split',
        id: 'split_test_4way',
        axis: 'x',
        children: [
          { kind: 'panel', panel: 'p_0' },
          { kind: 'panel', panel: 'p_1' },
          { kind: 'panel', panel: 'p_2' },
          { kind: 'panel', panel: 'p_3' }
        ],
        weights: [0.25, 0.25, 0.25, 0.25]
      };

      workspaceStore.setState(() => ({
        active: 'ws_test_4way',
        workspaces: {
          ws_test_4way: {
            id: 'ws_test_4way',
            name: 'Test 4-Way Workspace',
            schemaVersion: 2,
            root: splitNode,
            panels: {
              p_0: { id: 'p_0', type: 'playlists', local: {} },
              p_1: { id: 'p_1', type: 'router-view', local: {} },
              p_2: { id: 'p_2', type: 'lyrics', local: {} },
              p_3: { id: 'p_3', type: 'queue', local: {} }
            },
            frame: { playerBar: 'bottom', playerBarCompact: false }
          }
        }
      }));

      const { container } = render(<NodeView node={splitNode} />);
      const dividers = container.querySelectorAll('.split-divider');
      expect(dividers).toHaveLength(3);

      const slots = container.querySelectorAll('.slot-container');
      expect(slots).toHaveLength(4);

      // Mock 250px each across 1000px container
      slots.forEach((s, idx) => {
        vi.spyOn(s, 'getBoundingClientRect').mockReturnValue({
          width: 250,
          height: 600,
          top: 0,
          left: idx * 250,
          right: (idx + 1) * 250,
          bottom: 600,
          x: idx * 250,
          y: 0,
          toJSON: () => {}
        });
      });

      const divider1 = dividers[1] as HTMLDivElement; // Middle divider between slot 1 and slot 2
      divider1.setPointerCapture = vi.fn();
      divider1.releasePointerCapture = vi.fn();

      // Drag middle divider by +50px (from clientX 500 to 550)
      act(() => {
        fireEvent.pointerDown(divider1, {
          pointerId: 1,
          clientX: 500,
          clientY: 300,
          button: 0
        });
      });

      act(() => {
        divider1.dispatchEvent(
          new PointerEvent('pointermove', {
            pointerId: 1,
            clientX: 550,
            clientY: 300
          })
        );
      });

      // pairWeight = 0.50. slot1 was 250, +50 = 300. slot2 was 250, -50 = 200. Total pair = 500.
      // ratio = 300/500 = 0.6. weight1 = 0.5 * 0.6 = 0.3. weight2 = 0.5 * 0.4 = 0.2.
      expect((slots[1] as HTMLElement).style.flexGrow).toBe('0.3');
      expect((slots[2] as HTMLElement).style.flexGrow).toBe('0.2');
      // Outer siblings slot 0 and slot 3 MUST stay 0.25
      expect((slots[0] as HTMLElement).style.flexGrow).toBe('0.25');
      expect((slots[3] as HTMLElement).style.flexGrow).toBe('0.25');

      act(() => {
        divider1.dispatchEvent(
          new PointerEvent('pointerup', {
            pointerId: 1
          })
        );
      });

      const updatedWs = workspaceStore.state.workspaces.ws_test_4way;
      const updatedRoot = updatedWs.root as SplitNode;
      expect(updatedRoot.weights[0]).toBe(0.25);
      expect(updatedRoot.weights[1]).toBeCloseTo(0.3, 2);
      expect(updatedRoot.weights[2]).toBeCloseTo(0.2, 2);
      expect(updatedRoot.weights[3]).toBe(0.25);
    });
  });
});
