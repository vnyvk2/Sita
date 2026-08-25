import {
  AmbientGlow,
  AuroraBackground,
  BorderBeam,
  DotLoader,
  ShimmerSkeleton,
  SpotlightCard
} from '@renderer/components/fx';
import { cleanup, fireEvent, render } from '@testing-library/react';
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Synchronous rAF stub: executes callbacks inline, tracks call count. */
const stubSyncRaf = () => {
  const raf = vi.fn((cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('requestAnimationFrame', raf);
  return raf;
};

describe('DotLoader', () => {
  it('renders aria-hidden orbit loader with 8 dots by default', () => {
    const { container } = render(<DotLoader />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.className).toContain('fx-dots');
    expect(container.querySelectorAll('.fx-dots__orbit-dot')).toHaveLength(8);
  });

  it('renders pulse (3x3) and wave (5 bars) variants', () => {
    const pulse = render(<DotLoader variant="pulse" />);
    expect(pulse.container.querySelectorAll('.fx-dots__pulse-dot')).toHaveLength(9);
    pulse.unmount();

    const wave = render(<DotLoader variant="wave" />);
    expect(wave.container.querySelectorAll('.fx-dots__wave-bar')).toHaveLength(5);
  });

  it('supports numeric pixel sizes and speed multiplier on animation timing', () => {
    const { container } = render(<DotLoader size={48} speed={2} />);
    const orbit = container.querySelector<HTMLElement>('.fx-dots__orbit');
    expect(orbit).toBeDefined();
    // default 1.2s at 2x speed => 0.6s
    expect(orbit!.style.getPropertyValue('--fx-orbit-duration')).toBe('0.600s');
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.width).toBe('48px');
  });

  it('clamps extreme speed multipliers into the calm range', () => {
    const { container } = render(<DotLoader speed={50} />);
    const orbit = container.querySelector<HTMLElement>('.fx-dots__orbit');
    // clamped to 3x => 1.2 / 3 = 0.4s
    expect(orbit!.style.getPropertyValue('--fx-orbit-duration')).toBe('0.400s');
  });
});

describe('ShimmerSkeleton', () => {
  it('renders an animated skeleton with inline dimensions', () => {
    const { container } = render(<ShimmerSkeleton width={120} height={16} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('fx-skeleton');
    expect(el.style.width).toBe('120px');
    expect(el.style.height).toBe('16px');
  });

  it('static variant disables the sweep class-wise', () => {
    const { container } = render(<ShimmerSkeleton animated={false} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('fx-skeleton--static');
  });

  it('circular variant forces a pill radius and mirrors height into width', () => {
    const { container } = render(<ShimmerSkeleton variant="circular" height={32} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('rounded-full!');
    expect(el.style.getPropertyValue('--fx-skeleton-radius')).toBe('9999px');
    expect(el.style.width).toBe('32px');
  });

  it('text variant defaults its height and stays full-width', () => {
    const { container } = render(<ShimmerSkeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.height).toBe('0.85em');
    expect(el.style.width).toBe('');
  });
});

describe('SpotlightCard', () => {
  it('never writes spotlight coordinates when not interactive', () => {
    stubSyncRaf();
    const { container } = render(<SpotlightCard data-testid="card" />);
    const el = container.firstElementChild as HTMLElement;

    fireEvent.pointerMove(el, { clientX: 42, clientY: 24 });

    expect(el.style.getPropertyValue('--fx-spotlight-x')).toBe('');
    expect(el.style.getPropertyValue('--fx-spotlight-y')).toBe('');
  });

  it('tracks the pointer synchronously when rAF is unavailable', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);

    const { container } = render(<SpotlightCard interactive data-testid="card" />);
    const el = container.firstElementChild as HTMLElement;

    fireEvent.pointerMove(el, { clientX: 42, clientY: 24 });

    expect(el.style.getPropertyValue('--fx-spotlight-x')).toBe('42px');
    expect(el.style.getPropertyValue('--fx-spotlight-y')).toBe('24px');
  });

  it('coalesces pointer updates into the pending frame and resets on leave', () => {
    let pendingFlush: FrameRequestCallback | null = null;
    const raf = vi.fn((cb: FrameRequestCallback) => {
      pendingFlush = cb;
      return 42;
    });
    const caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', caf);

    const { container } = render(<SpotlightCard interactive data-testid="card" />);
    const el = container.firstElementChild as HTMLElement;

    // Two moves within the same frame window collapse into ONE scheduled write.
    fireEvent.pointerMove(el, { clientX: 10, clientY: 5 });
    fireEvent.pointerMove(el, { clientX: 20, clientY: 6 });
    expect(raf).toHaveBeenCalledTimes(1);
    expect(el.style.getPropertyValue('--fx-spotlight-x')).toBe('');

    // Frame fires: exactly one DOM write, using the LATEST coordinates.
    pendingFlush!(0);
    expect(el.style.getPropertyValue('--fx-spotlight-x')).toBe('20px');
    expect(el.style.getPropertyValue('--fx-spotlight-y')).toBe('6px');

    // After the flush a fresh frame can be scheduled again.
    fireEvent.pointerMove(el, { clientX: 30, clientY: 7 });
    expect(raf).toHaveBeenCalledTimes(2);

    // Leaving mid-frame cancels the pending write and restores defaults.
    fireEvent.pointerLeave(el);
    expect(caf).toHaveBeenCalledWith(42);
    expect(el.style.getPropertyValue('--fx-spotlight-x')).toBe('50%');
    expect(el.style.getPropertyValue('--fx-spotlight-y')).toBe('0%');
  });

  it('exposes custom props (size/intensity/color) as CSS variables', () => {
    const { container } = render(<SpotlightCard size={200} intensity={0.4} color="10 20 30" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.getPropertyValue('--fx-spotlight-size')).toBe('200px');
    expect(el.style.getPropertyValue('--fx-spotlight-intensity')).toBe('0.4');
    expect(el.style.getPropertyValue('--fx-spotlight-color')).toBe('10 20 30');
  });

  it('keeps user className and forwards extra div attributes', () => {
    const { container } = render(
      <SpotlightCard title="library card" className="custom rounded-2xl" />
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('title')).toBe('library card');
    expect(el.className).toContain('custom');
    expect(el.className).toContain('fx-spotlight');
  });
});

describe('BorderBeam', () => {
  it('animates by default with configurable duration and thickness', () => {
    const { container } = render(<BorderBeam thickness={3} duration={2} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('fx-beam--animate');
    expect(el.style.getPropertyValue('--fx-beam-width')).toBe('3px');
    expect(el.style.getPropertyValue('--fx-beam-duration')).toBe('2s');
  });

  it('static mode drops the animation class but keeps the ring styling hook', () => {
    const { container } = render(<BorderBeam animated={false} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('fx-beam');
    expect(el.className).not.toContain('fx-beam--animate');
  });

  it('reverse and custom colors flow through as custom properties', () => {
    const { container } = render(<BorderBeam reverse colorFrom="1 2 3" colorTo="4 5 6" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('fx-beam--reverse');
    expect(el.style.getPropertyValue('--fx-beam-from')).toBe('1 2 3');
    expect(el.style.getPropertyValue('--fx-beam-to')).toBe('4 5 6');
  });
});

describe('AmbientGlow', () => {
  it('renders decorative pre-blurred art with drift enabled by default', () => {
    const { container } = render(<AmbientGlow src="art.webp" />);
    const root = container.firstElementChild as HTMLElement;
    const img = container.querySelector('img');

    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(img).toBeDefined();
    expect(img!.getAttribute('src')).toBe('art.webp');
    expect(img!.getAttribute('alt')).toBe('');
    expect(img!.parentElement!.className).toContain('animate-ambient-drift');
    expect(img!.style.filter).toContain('blur(56px)');
  });

  it('omits drift animation and veil per props, tolerates missing src', () => {
    const { container } = render(
      <AmbientGlow src={null} drift={false} overlay={false} blur={12} />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.fx-ambient__overlay')).toBeNull();
    const layer = container.querySelector('.fx-ambient__layer') as HTMLElement;
    expect(layer.className).not.toContain('animate-ambient-drift');
  });
});

describe('AuroraBackground', () => {
  it('renders three blobs with animated class by default', () => {
    const { container } = render(<AuroraBackground />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.className).toContain('fx-aurora--animate');
    expect(root.querySelectorAll('.fx-aurora__blob')).toHaveLength(3);
  });

  it('applies custom channel colors with intensity-scaled alpha', () => {
    const { container } = render(
      <AuroraBackground colors={['100 50% 50%', '200 60% 40%']} intensity={0.5} />
    );
    const firstBlob = container.querySelector('.fx-aurora__blob') as HTMLElement;
    expect(firstBlob.style.getPropertyValue('--fx-blob-color')).toBe('hsl(100 50% 50% / 0.300)');
  });

  it('static mode removes only the animation class', () => {
    const { container } = render(<AuroraBackground animated={false} />);
    expect((container.firstElementChild as HTMLElement).className).not.toContain(
      'fx-aurora--animate'
    );
  });
});
