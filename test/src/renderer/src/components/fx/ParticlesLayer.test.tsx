import { ParticlesLayer } from '@renderer/components/fx';
import { cleanup, render } from '@testing-library/react';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createFake2d = () => ({
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  globalAlpha: 1,
  fillStyle: ''
});

let fakeCtx: ReturnType<typeof createFake2d>;
let rafSpy: ReturnType<typeof vi.fn>;
let cancelSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  processedCalls = 0;
  fakeCtx = createFake2d();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    fakeCtx as unknown as CanvasRenderingContext2D
  );
  // Id-keyed rAF registry: robust regardless of scheduling order or count.
  let handle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  rafSpy = vi.fn((cb: FrameRequestCallback) => {
    const id = handle;
    handle += 1;
    callbacks.set(id, cb);
    return id;
  });
  cancelSpy = vi.fn((id: number) => {
    callbacks.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', rafSpy);
  vi.stubGlobal('cancelAnimationFrame', cancelSpy);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
  );
});

/** Offset cursor: vitest 4's mock.calls array must not be mutated directly. */
let processedCalls = 0;

/** Runs every pending callback once (they may re-schedule new ones). */
const flushFrames = (times: number) => {
  for (let i = 0; i < times; i += 1) {
    const all = rafSpy.mock.calls as unknown[][];
    const batch = all.slice(processedCalls).map((call) => call[0] as FrameRequestCallback);
    processedCalls = all.length;
    if (batch.length === 0) break;
    batch.forEach((cb) => cb(performance.now()));
  }
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ParticlesLayer', () => {
  it('renders a decorative, transparent canvas when inactive', () => {
    const { container } = render(<ParticlesLayer />);
    const canvas = container.firstElementChild as HTMLCanvasElement;

    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('runs its loop only while active and cancels on unmount', () => {
    const { unmount } = render(<ParticlesLayer isActive />);

    expect(rafSpy).toHaveBeenCalled();
    flushFrames(3);
    expect(fakeCtx.clearRect).toHaveBeenCalled();

    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('cancels the running loop when isActive flips to false', () => {
    const view = render(<ParticlesLayer isActive />);

    flushFrames(2);
    const drawsWhileActive = (fakeCtx.drawImage as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(drawsWhileActive).toBeGreaterThan(0);

    view.rerender(<ParticlesLayer isActive={false} />);

    // The pending frame must be cancelled, not left to fire once more.
    flushFrames(5);
    const drawsAfterDeactivate = (fakeCtx.drawImage as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(drawsAfterDeactivate).toBe(drawsWhileActive);
  });

  it('skips drawing work while system-paused', () => {
    render(<ParticlesLayer isActive isSystemPaused />);
    flushFrames(5);

    expect(fakeCtx.clearRect).not.toHaveBeenCalled();
  });

  it('caps particle count at the hard limit of 80', () => {
    render(<ParticlesLayer isActive count={500} />);
    flushFrames(1);

    // drawImage happens once per particle per frame
    const draws = (fakeCtx.drawImage as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(draws).toBeLessThanOrEqual(80);
    expect(draws).toBeGreaterThan(0);
  });

  it('tints particles from the live accent CSS variable', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (prop: string) => (prop === '--foreground-color-1' ? '244 98% 80%' : '')
    } as CSSStyleDeclaration);

    render(<ParticlesLayer isActive />);
    flushFrames(1);

    const gradient = (fakeCtx.createRadialGradient as ReturnType<typeof vi.fn>).mock.results[0]
      .value as { addColorStop: ReturnType<typeof vi.fn> };
    expect(gradient.addColorStop).toHaveBeenNthCalledWith(1, 0, 'hsl(244 98% 80% / 0.9)');
    expect(gradient.addColorStop).toHaveBeenNthCalledWith(2, 0.4, 'hsl(244 98% 80% / 0.35)');
  });
});
