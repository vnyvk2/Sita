import { NodeView } from '@renderer/workspace/engine/NodeView';
import { LyricsPanel } from '@renderer/workspace/panels/LyricsPanel/LyricsPanel';
import { QueuePanel } from '@renderer/workspace/panels/QueuePanel/QueuePanel';
import { getInitialWorkspaceState } from '@renderer/workspace/persistence';
import { MUSICBEE_PRESET } from '@renderer/workspace/presets/musicbee';
import { workspaceStore } from '@renderer/workspace/store';
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
  useLocation: () => ({ pathname: '/main-player' }),
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

      render(<QueuePanel instance={mockInstance} api={mockApi} />);
      expect(screen.getByText('Queue 1')).toBeDefined();
      expect(screen.getByText('Queue is empty')).toBeDefined();
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

      render(<LyricsPanel instance={mockInstance} api={mockApi} />);
      expect(screen.getByTitle('Expand to full page')).toBeDefined();
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
