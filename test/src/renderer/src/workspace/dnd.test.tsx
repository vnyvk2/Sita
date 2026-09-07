import { DropOverlay } from '@renderer/workspace/engine/DropOverlay';
import { PanelFrame } from '@renderer/workspace/engine/PanelFrame';
import { calculateDropEdge } from '@renderer/workspace/engine/usePanelDragDrop';
import { dndStore } from '@renderer/workspace/store';
// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Drag & Drop System', () => {
  beforeEach(() => {
    dndStore.setState(() => ({
      isDragging: false,
      currentDrag: null,
      hoveredDropTarget: null,
      maximizedPanelId: null
    }));
  });

  describe('calculateDropEdge 5-Zone Math', () => {
    const mockRect = {
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
      right: 1000,
      bottom: 1000,
      x: 0,
      y: 0,
      toJSON: () => {}
    } as DOMRect;

    it('identifies left edge when x < 0.22', () => {
      expect(calculateDropEdge(mockRect, 100, 500)).toBe('left');
    });

    it('identifies right edge when x > 0.78', () => {
      expect(calculateDropEdge(mockRect, 900, 500)).toBe('right');
    });

    it('identifies top edge when y < 0.22', () => {
      expect(calculateDropEdge(mockRect, 500, 100)).toBe('top');
    });

    it('identifies bottom edge when y > 0.78', () => {
      expect(calculateDropEdge(mockRect, 500, 900)).toBe('bottom');
    });

    it('identifies center (tab insert) when pointer is inside inner zone', () => {
      expect(calculateDropEdge(mockRect, 500, 500)).toBe('center');
    });
  });

  describe('DropOverlay Component', () => {
    it('renders null when not dragging', () => {
      const { container } = render(<DropOverlay nodeId="target_node" />);
      expect(container.firstChild).toBeNull();
    });

    it('renders edge highlight when target node is hovered', () => {
      render(<DropOverlay nodeId="target_node" />);

      act(() => {
        dndStore.setState({
          isDragging: true,
          currentDrag: { panelId: 'p_source' },
          hoveredDropTarget: { nodeId: 'target_node', edge: 'left' },
          maximizedPanelId: null
        });
      });

      expect(screen.getByTestId('drop-overlay')).toBeDefined();
      expect(screen.getByText('Split left')).toBeDefined();
    });

    it('renders tab highlight when center zone is hovered', () => {
      render(<DropOverlay nodeId="target_node" />);

      act(() => {
        dndStore.setState({
          isDragging: true,
          currentDrag: { panelId: 'p_source' },
          hoveredDropTarget: { nodeId: 'target_node', edge: 'center' },
          maximizedPanelId: null
        });
      });

      expect(screen.getByText('Add as Tab')).toBeDefined();
    });
  });

  describe('PanelFrame Pointer Interaction', () => {
    it('initiates drag state when pointer moves past threshold', () => {
      render(
        <PanelFrame panelId="p_test_drag" type="queue" title="Draggable Queue" icon="queue_music">
          <div>Body</div>
        </PanelFrame>
      );

      const header = screen.getByText('Draggable Queue').closest('header')!;

      // Pointer down at (100, 100)
      fireEvent.pointerDown(header, {
        button: 0,
        clientX: 100,
        clientY: 100
      });

      // Move 2px (below threshold) -> should not drag yet
      fireEvent.pointerMove(window, {
        clientX: 102,
        clientY: 102
      });
      expect(dndStore.state.isDragging).toBe(false);

      // Move 10px (past threshold) -> should trigger drag
      fireEvent.pointerMove(window, {
        clientX: 115,
        clientY: 115
      });
      expect(dndStore.state.isDragging).toBe(true);
      expect(dndStore.state.currentDrag?.panelId).toBe('p_test_drag');

      // Pointer up ends drag
      fireEvent.pointerUp(window);
      expect(dndStore.state.isDragging).toBe(false);
      expect(dndStore.state.currentDrag).toBeNull();
    });

    it('does not render DropOverlay or data-node-id when showHeader is false (hosted in TabGroup)', () => {
      const { container } = render(
        <PanelFrame
          panelId="p_test_nohdr"
          type="queue"
          title="Inside Tab"
          icon="queue_music"
          showHeader={false}
        >
          <div>Tab Content</div>
        </PanelFrame>
      );

      const panelEl = container.querySelector('.panel-frame');
      expect(panelEl?.getAttribute('data-node-id')).toBeNull();
      expect(container.querySelector('[data-testid="drop-overlay"]')).toBeNull();
    });
  });
});
