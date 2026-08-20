// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SoundBarsIndicator from './SoundBarsIndicator';

describe('SoundBarsIndicator Component — Discrete Dot-Matrix Visualizer', () => {
  it('renders with aria-hidden="true" for accessibility', () => {
    const { container } = render(<SoundBarsIndicator isPlaying={true} />);
    const indicator = container.querySelector('.sound-bars-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders true segmented 4x4 matrix with ghost grid and active rows', () => {
    const { container } = render(<SoundBarsIndicator variant="dots" />);

    // Ghost matrix grid: 4 columns x 4 rows = 16 background LED positions
    const ghostDots = container.querySelectorAll('.sound-bars-ghost-dot');
    expect(ghostDots.length).toBe(16);

    // Active matrix: 4 columns
    const columns = container.querySelectorAll('.sound-bars-active-matrix .sound-bars-column');
    expect(columns.length).toBe(4);

    // Baseline dots (Row 1): exactly 4 dots (1 per column)
    const baseDots = container.querySelectorAll('.sound-bars-dot-base');
    expect(baseDots.length).toBe(4);

    // Upper animated dots (Rows 2, 3, 4): exactly 12 dots (3 per column)
    const upperDots = container.querySelectorAll('.sound-bars-dot');
    expect(upperDots.length).toBe(12);

    // Total active LED cells: exactly 16 dots
    const totalActiveDots = container.querySelectorAll('.sound-bars-active-matrix rect');
    expect(totalActiveDots.length).toBe(16);
  });

  it('renders bars variant when specified', () => {
    const { container } = render(<SoundBarsIndicator variant="bars" />);
    const bars = container.querySelectorAll('.sound-bars-active-bars rect');
    expect(bars.length).toBe(4);
  });

  it('applies sound-bars--playing class when isPlaying is true', () => {
    const { container } = render(<SoundBarsIndicator isPlaying={true} />);
    const indicator = container.querySelector('.sound-bars-indicator');
    expect(indicator?.classList.contains('sound-bars--playing')).toBe(true);
    expect(indicator?.classList.contains('sound-bars--paused')).toBe(false);
  });

  it('applies sound-bars--paused class when isPlaying is false for deterministic idle baseline', () => {
    const { container } = render(<SoundBarsIndicator isPlaying={false} />);
    const indicator = container.querySelector('.sound-bars-indicator');
    expect(indicator?.classList.contains('sound-bars--paused')).toBe(true);
    expect(indicator?.classList.contains('sound-bars--playing')).toBe(false);

    // Baseline dots are present and retained
    const baseDots = container.querySelectorAll('.sound-bars-dot-base');
    expect(baseDots.length).toBe(4);
  });

  it('supports size presets and custom numeric size', () => {
    const { container: cXs } = render(<SoundBarsIndicator size="xs" />);
    const elXs = cXs.querySelector('.sound-bars-indicator') as HTMLElement;
    expect(elXs?.style.width).toBe('14px');
    expect(elXs?.style.height).toBe('14px');

    const { container: cSm } = render(<SoundBarsIndicator size="sm" />);
    const elSm = cSm.querySelector('.sound-bars-indicator') as HTMLElement;
    expect(elSm?.style.width).toBe('16px');
    expect(elSm?.style.height).toBe('16px');

    const { container: cCustom } = render(<SoundBarsIndicator size={28} />);
    const elCustom = cCustom.querySelector('.sound-bars-indicator') as HTMLElement;
    expect(elCustom?.style.width).toBe('28px');
    expect(elCustom?.style.height).toBe('28px');
  });

  it('passes through custom className and color', () => {
    const { container } = render(
      <SoundBarsIndicator className="custom-equalizer-class" color="#00ffcc" />
    );
    const indicator = container.querySelector('.sound-bars-indicator');
    expect(indicator?.classList.contains('custom-equalizer-class')).toBe(true);

    const ghostGrid = container.querySelector('.sound-bars-ghost-grid');
    expect(ghostGrid?.getAttribute('fill')).toBe('#00ffcc');
  });
});
