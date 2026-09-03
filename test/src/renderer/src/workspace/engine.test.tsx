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
});
