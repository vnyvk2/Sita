// @vitest-environment jsdom
import { render, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import ScrollableTitle from '../ScrollableTitle';

describe('ScrollableTitle Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the title text correctly', () => {
    const { container } = render(<ScrollableTitle title="My Chill Playlist" />);
    expect(container.textContent).toContain('My Chill Playlist');
  });

  it('renders an invisible measurement probe with aria-hidden="true"', () => {
    const { container } = render(<ScrollableTitle title="Probe Test" />);
    const probe = container.querySelector('span[aria-hidden="true"]');
    expect(probe).not.toBeNull();
    expect(probe?.textContent).toBe('Probe Test');
    expect(probe?.classList.contains('invisible')).toBe(true);
    expect(probe?.classList.contains('absolute')).toBe(true);
  });

  it('does not animate when content fits inside container', () => {
    const { container } = render(<ScrollableTitle title="Short" />);
    const wrapper = container.firstElementChild as HTMLElement;

    // Simulate container larger than text
    Object.defineProperty(wrapper, 'clientWidth', { configurable: true, value: 500 });
    const probe = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    vi.spyOn(probe, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 20,
      top: 0,
      left: 0,
      bottom: 20,
      right: 100,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    fireEvent.mouseEnter(wrapper);

    const animatedEl = wrapper.querySelector('.animate-marquee-scroll');
    expect(animatedEl).toBeNull();
  });

  it('triggers marquee animation on hover when title overflows', () => {
    const { container } = render(
      <ScrollableTitle title="Very Long Playlist Name That Overflows" />
    );
    const wrapper = container.firstElementChild as HTMLElement;

    // Simulate text wider than container
    Object.defineProperty(wrapper, 'clientWidth', { configurable: true, value: 200 });
    const probe = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    vi.spyOn(probe, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 20,
      top: 0,
      left: 0,
      bottom: 20,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    // Hover
    fireEvent.mouseEnter(wrapper);

    const animatedEl = wrapper.querySelector('.animate-marquee-scroll');
    expect(animatedEl).not.toBeNull();
    expect(wrapper.style.getPropertyValue('--marquee-dist')).toBe('-216px'); // 400 - 200 + 16
  });

  it('stops marquee animation and restores truncate on mouse leave', () => {
    const { container } = render(<ScrollableTitle title="Hover Out Test" />);
    const wrapper = container.firstElementChild as HTMLElement;

    Object.defineProperty(wrapper, 'clientWidth', { configurable: true, value: 200 });
    const probe = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    vi.spyOn(probe, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 20,
      top: 0,
      left: 0,
      bottom: 20,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    // Hover in
    fireEvent.mouseEnter(wrapper);
    expect(wrapper.querySelector('.animate-marquee-scroll')).not.toBeNull();

    // Hover out
    fireEvent.mouseLeave(wrapper);
    expect(wrapper.querySelector('.animate-marquee-scroll')).toBeNull();
    expect(wrapper.querySelector('.truncate')).not.toBeNull();
  });

  it('calculates duration according to custom speed prop', () => {
    const { container } = render(<ScrollableTitle title="Speed Calculation Test" speed={80} />);
    const wrapper = container.firstElementChild as HTMLElement;

    Object.defineProperty(wrapper, 'clientWidth', { configurable: true, value: 200 });
    const probe = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    vi.spyOn(probe, 'getBoundingClientRect').mockReturnValue({
      width: 440,
      height: 20,
      top: 0,
      left: 0,
      bottom: 20,
      right: 440,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    fireEvent.mouseEnter(wrapper);

    // overflowDistance = 440 - 200 + 16 = 256px
    // scrollTime = 256 / 80 = 3.2s
    // totalDuration = 3.2 * 2 + 2.4 = 8.8s
    expect(wrapper.style.getPropertyValue('--marquee-duration')).toBe('8.8s');
  });
});
