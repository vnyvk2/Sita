// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import AlphabetScrubber from '../AlphabetScrubber';

describe('AlphabetScrubber Component', () => {
  const defaultAlphabetMap = {
    '#': 0,
    A: 15,
    B: 50,
    M: 200,
    Z: 500
  };

  const defaultLetterCounts = {
    '#': 15,
    A: 35,
    B: 150,
    M: 300,
    Z: 20
  };

  it('renders all 27 standard letter slots', () => {
    render(
      <AlphabetScrubber
        alphabetMap={defaultAlphabetMap}
        letterCounts={defaultLetterCounts}
        position="left-vertical"
        sortOrder="aToZ"
        onSelectLetter={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(27);
    expect(buttons[0].textContent).toBe('#');
    expect(buttons[1].textContent).toBe('A');
    expect(buttons[26].textContent).toBe('Z');
  });

  it('correctly sets enabled/disabled state and ARIA labels with counts', () => {
    render(
      <AlphabetScrubber
        alphabetMap={defaultAlphabetMap}
        letterCounts={defaultLetterCounts}
        position="left-vertical"
        sortOrder="aToZ"
        onSelectLetter={vi.fn()}
      />
    );

    // Active letter 'A'
    const btnA = screen.getByRole('button', { name: 'A: 35 songs' });
    expect(btnA.hasAttribute('disabled')).toBe(false);
    expect(btnA.getAttribute('aria-disabled')).toBe('false');
    expect(btnA.getAttribute('tabindex')).toBe('0');

    // Inactive letter 'C' (no songs)
    const btnC = screen.getByText('C');
    expect(btnC.hasAttribute('disabled')).toBe(true);
    expect(btnC.getAttribute('aria-disabled')).toBe('true');
    expect(btnC.getAttribute('tabindex')).toBe('-1');
  });

  it('invokes onSelectLetter with letter and target index on click', () => {
    const onSelectLetter = vi.fn();
    render(
      <AlphabetScrubber
        alphabetMap={defaultAlphabetMap}
        letterCounts={defaultLetterCounts}
        position="top-horizontal"
        sortOrder="aToZ"
        onSelectLetter={onSelectLetter}
      />
    );

    const btnB = screen.getByRole('button', { name: 'B: 150 songs' });
    fireEvent.click(btnB);

    expect(onSelectLetter).toHaveBeenCalledTimes(1);
    expect(onSelectLetter).toHaveBeenCalledWith('B', 50);
  });

  it('applies active highlight styles to activeLetter', () => {
    render(
      <AlphabetScrubber
        alphabetMap={defaultAlphabetMap}
        letterCounts={defaultLetterCounts}
        position="left-vertical"
        sortOrder="aToZ"
        activeLetter="M"
        onSelectLetter={vi.fn()}
      />
    );

    const btnM = screen.getByRole('button', { name: 'M: 300 songs' });
    expect(btnM.className).toContain('bg-font-color-highlight');
  });

  it('reverses display order for zToA sort order', () => {
    render(
      <AlphabetScrubber
        alphabetMap={defaultAlphabetMap}
        letterCounts={defaultLetterCounts}
        position="top-horizontal"
        sortOrder="zToA"
        onSelectLetter={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[0].textContent).toBe('Z');
    expect(buttons[25].textContent).toBe('A');
    expect(buttons[26].textContent).toBe('#');
  });

  it('handles pointer down capture and deduplicated scrubbing', () => {
    const onSelectLetter = vi.fn();
    const { container } = render(
      <AlphabetScrubber
        alphabetMap={defaultAlphabetMap}
        letterCounts={defaultLetterCounts}
        position="left-vertical"
        sortOrder="aToZ"
        onSelectLetter={onSelectLetter}
      />
    );

    const nav = container.querySelector('nav')!;
    const btnA = screen.getByRole('button', { name: 'A: 35 songs' });
    const btnB = screen.getByRole('button', { name: 'B: 150 songs' });

    // Mock pointer capture functions
    nav.setPointerCapture = vi.fn();
    nav.hasPointerCapture = vi.fn().mockReturnValue(true);
    nav.releasePointerCapture = vi.fn();

    // Mock document.elementFromPoint
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(btnA);

    // 1. Pointer down over 'A'
    fireEvent.pointerDown(nav, { pointerId: 1, button: 0, clientX: 10, clientY: 20 });
    expect(nav.setPointerCapture).toHaveBeenCalledWith(1);
    expect(onSelectLetter).toHaveBeenCalledTimes(1);
    expect(onSelectLetter).toHaveBeenCalledWith('A', 15);

    // 2. Pointer move over same letter 'A' -> deduplicated (not called again)
    fireEvent.pointerMove(nav, { pointerId: 1, clientX: 10, clientY: 22 });
    expect(onSelectLetter).toHaveBeenCalledTimes(1);

    // 3. Pointer move over 'B'
    vi.mocked(document.elementFromPoint).mockReturnValue(btnB);
    fireEvent.pointerMove(nav, { pointerId: 1, clientX: 10, clientY: 40 });
    expect(onSelectLetter).toHaveBeenCalledTimes(2);
    expect(onSelectLetter).toHaveBeenCalledWith('B', 50);

    // 4. Pointer move over empty letter 'C' -> holds previous letter (does NOT fire onSelectLetter)
    const btnC = screen.getByText('C');
    vi.mocked(document.elementFromPoint).mockReturnValue(btnC);
    fireEvent.pointerMove(nav, { pointerId: 1, clientX: 10, clientY: 60 });
    expect(onSelectLetter).toHaveBeenCalledTimes(2); // Still 2

    // 5. Pointer up
    fireEvent.pointerUp(nav, { pointerId: 1 });
    expect(nav.releasePointerCapture).toHaveBeenCalledWith(1);

    // Restore
    document.elementFromPoint = originalElementFromPoint;
  });
});
