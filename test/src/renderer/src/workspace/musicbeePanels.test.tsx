import { NodeView } from '@renderer/workspace/engine/NodeView';
import { PanelFrame } from '@renderer/workspace/engine/PanelFrame';
import { LyricsPanel } from '@renderer/workspace/panels/LyricsPanel/LyricsPanel';
import { PlaylistsPanel } from '@renderer/workspace/panels/PlaylistsPanel/PlaylistsPanel';
import { QueuePanel } from '@renderer/workspace/panels/QueuePanel/QueuePanel';
import { getInitialWorkspaceState } from '@renderer/workspace/persistence';
import { MUSICBEE_PRESET } from '@renderer/workspace/presets/musicbee';
import { workspaceStore } from '@renderer/workspace/store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock react-i18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultVal?: string) => defaultVal ?? key
    })
  };
});

// Mock router navigation
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: (opts?: { select?: (loc: unknown) => unknown }) => {
    const loc = { pathname: '/main-player' };
    return opts?.select ? opts.select(loc) : loc;
  },
  Outlet: () => <div data-testid="router-outlet">Mock Outlet Content</div>
}));

// Mock lyrics query
vi.mock('@renderer/queries/lyrics', () => ({
  useLyricsQuery: () => ({
    data: null,
    isPending: false
  })
}));

// Mock skip lyrics hook
vi.mock('@renderer/hooks/useSkipLyricsLines', () => ({
  default: vi.fn()
}));

// Mock active lyric index hook
vi.mock('@renderer/components/LyricsPage/useActiveLyricIndex', () => ({
  useActiveLyricIndex: () => 0
}));

// Mock playlists collection queries/mutations (IPC-backed in production)
vi.mock('@renderer/hooks/collections/useCollectionQueries', () => ({
  useRootCollections: () => ({ data: [], isLoading: false })
}));

vi.mock('@renderer/hooks/collections/useCollectionMutations', () => ({
  usePinCollection: () => ({ mutate: vi.fn() }),
  useUnpinCollection: () => ({ mutate: vi.fn() })
}));

describe('MusicBee Widgets: QueuePanel and LyricsPanel', () => {
  beforeEach(() => {
    workspaceStore.setState(() => ({
      active: MUSICBEE_PRESET.id,
      workspaces: {
        [MUSICBEE_PRESET.id]: MUSICBEE_PRESET
      }
    }));
  });

  describe('QueuePanel', () => {
    it('renders queue header and empty state when songIds is empty', () => {
      const mockApi = {
        instanceId: 'p_queue_test',
        type: 'queue' as const,
        setLocal: vi.fn(),
        getLocal: vi.fn(),
        close: vi.fn(),
        maximize: vi.fn()
      };

      const mockInstance = {
        id: 'p_queue_test',
        type: 'queue' as const,
        local: {}
      };

      const queryClient = new QueryClient();
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <PanelFrame panelId="p_queue_test" type="queue" title="Queue" icon="queue_music">
            <QueuePanel instance={mockInstance} api={mockApi} />
          </PanelFrame>
        </QueryClientProvider>
      );
      expect(screen.getByText('Queue 1')).toBeDefined();
      expect(screen.getByText('Queue is empty')).toBeDefined();
      // Fused header: exactly one frame header, no legacy internal sub-header
      expect(container.querySelectorAll('header.panel-header')).toHaveLength(1);
    });
  });

  describe('LyricsPanel', () => {
    it('renders track header and fallback when no lyrics available', () => {
      const mockApi = {
        instanceId: 'p_lyrics_test',
        type: 'lyrics' as const,
        setLocal: vi.fn(),
        getLocal: vi.fn(),
        close: vi.fn(),
        maximize: vi.fn()
      };

      const mockInstance = {
        id: 'p_lyrics_test',
        type: 'lyrics' as const,
        local: {}
      };

      render(
        <PanelFrame panelId="p_lyrics_test" type="lyrics" title="Lyrics" icon="lyrics">
          <LyricsPanel instance={mockInstance} api={mockApi} />
        </PanelFrame>
      );
      expect(screen.getByText('No track selected')).toBeDefined();
      expect(document.querySelectorAll('header.panel-header')).toHaveLength(1);
    });
  });

  describe('PlaylistsPanel', () => {
    it('renders inside the fused header with no duplicate sub-header', () => {
      const mockApi = {
        instanceId: 'p_playlists_test',
        type: 'playlists' as const,
        setLocal: vi.fn(),
        getLocal: vi.fn(),
        close: vi.fn(),
        maximize: vi.fn()
      };

      const mockInstance = {
        id: 'p_playlists_test',
        type: 'playlists' as const,
        local: {}
      };

      const { container } = render(
        <PanelFrame panelId="p_playlists_test" type="playlists" title="Playlists" icon="queue_music">
          <PlaylistsPanel instance={mockInstance} api={mockApi} />
        </PanelFrame>
      );
      // Single fused frame header; panel body contributes count pill via slot
      expect(container.querySelectorAll('header.panel-header')).toHaveLength(1);
      expect(container.querySelector('.playlists-panel header')).toBeNull();
      expect(screen.getByTitle('Create Playlist')).toBeDefined();
    });
  });

  describe('MusicBee Preset Full Layout Integration', () => {
    it('renders MUSICBEE_PRESET split columns and tab group without errors', () => {
      const { container } = render(<NodeView node={MUSICBEE_PRESET.root} />);
      expect(container.querySelector('.split-view')).toBeDefined();
      expect(container.querySelector('.tab-group')).toBeDefined();
    });
  });
});
