// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import LyricLine from '../LyricLine';
import { renderLyricsLines } from '../lyricsUtils';
import { AppUpdateContext, type AppUpdateContextType } from '../../../contexts/AppUpdateContext';

const translationCallsByLine: Record<number, number> = {};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (options?.start !== undefined) {
        // Track translation calls per line start timestamp to verify component execution
        translationCallsByLine[options.start] = (translationCallsByLine[options.start] || 0) + 1;
      }
      return key;
    }
  })
}));

const mockAppContext: Partial<AppUpdateContextType> = {
  updateSongPosition: vi.fn(),
  updateContextMenuData: vi.fn()
};

function renderWithContext(ui: React.ReactNode) {
  return render(
    <AppUpdateContext.Provider value={mockAppContext as AppUpdateContextType}>
      {ui}
    </AppUpdateContext.Provider>
  );
}

describe('LyricLine Memoization Boundary (Phase L1)', () => {
  it('renders synced line with scalar start and end props', () => {
    const { container } = renderWithContext(
      <LyricLine
        index={0}
        lyric="Test lyric line"
        syncedStart={10}
        syncedEnd={20}
        isActive={true}
        playerType="normal"
      />
    );

    expect(screen.getByText('Test lyric line')).toBeDefined();
    const activeEl = container.querySelector('.highlight');
    expect(activeEl).toBeDefined();
    expect(activeEl?.className).toContain('text-font-color-highlight');
  });

  it('directly proves exported memo(LyricLine) bails out of component function execution', () => {
    // Reset tracker
    translationCallsByLine[0] = 0;   // Line 0 (start: 0)
    translationCallsByLine[5] = 0;   // Line 1 (start: 5)
    translationCallsByLine[10] = 0;  // Line 2 (start: 10)

    function TestLyricsContainer() {
      const [activeIndex, setActiveIndex] = useState(0);

      return (
        <div>
          <button onClick={() => setActiveIndex(1)}>Advance Active Line</button>
          <LyricLine
            index={0}
            lyric="Line 0"
            syncedStart={0}
            syncedEnd={5}
            isActive={activeIndex === 0}
          />
          <LyricLine
            index={1}
            lyric="Line 1"
            syncedStart={5}
            syncedEnd={10}
            isActive={activeIndex === 1}
          />
          <LyricLine
            index={2}
            lyric="Line 2"
            syncedStart={10}
            syncedEnd={15}
            isActive={activeIndex === 2}
          />
        </div>
      );
    }

    renderWithContext(<TestLyricsContainer />);

    // Initial mount: all 3 lines execute once
    expect(translationCallsByLine[0]).toBe(1);
    expect(translationCallsByLine[5]).toBe(1);
    expect(translationCallsByLine[10]).toBe(1);

    // Trigger active line change in parent: Line 0 (true -> false), Line 1 (false -> true), Line 2 (false -> false)
    const advanceBtn = screen.getByText('Advance Active Line');
    act(() => {
      advanceBtn.click();
    });

    // Line 0 changed (isActive: true -> false): executed (count = 2)
    expect(translationCallsByLine[0]).toBe(2);

    // Line 1 changed (isActive: false -> true): executed (count >= 2 due to active line state)
    expect(translationCallsByLine[5]).toBeGreaterThanOrEqual(2);

    // Line 2 props were IDENTICAL scalar primitives:
    // React.memo bailed out, LyricLine component function DID NOT EXECUTE!
    expect(translationCallsByLine[10]).toBe(1);
  });

  it('renderLyricsLines delivers scalar syncedStart and syncedEnd props', () => {
    const mockLyrics: SongLyrics = {
      isOfflineLyricsAvailable: false,
      lyrics: {
        copyright: 'Test',
        isSynced: true,
        offset: 0,
        parsedLyrics: [
          { start: 0, end: 5, originalText: 'Line 1' },
          { start: 5, end: 10, originalText: 'Line 2' }
        ]
      }
    };

    const components = renderLyricsLines(mockLyrics, 200, true, 'normal', 0);
    expect(components).toHaveLength(2);
    const firstComp = components[0] as React.ReactElement;
    expect(firstComp.props.syncedStart).toBe(0);
    expect(firstComp.props.syncedEnd).toBe(5);
    expect(firstComp.props.isActive).toBe(true);
  });
});
