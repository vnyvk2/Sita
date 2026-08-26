import { memo, useEffect, useRef } from 'react';

export interface ParticlesLayerProps {
  /**
   * Master gate: when false the rAF loop never starts (and any running loop is cancelled). Callers
   * combine the user pref with playing state.
   *
   * @default false
   */
  isActive?: boolean;
  /**
   * Extra system pause (battery saver etc.). CANCELS the rAF loop while set (not merely idling) and
   * restarts it when lifted; independent from isActive so a paused player and a disabled pref stay
   * distinguishable.
   *
   * @default false
   */
  isSystemPaused?: boolean;
  /**
   * Particle tint as HSL channels (e.g. `'244 98% 80'`). Defaults to the live theme accent
   * (`--foreground-color-1`) so it tracks the dynamic palette automatically.
   */
  color?: string;
  /**
   * Particle count. Hard-capped at 80 regardless of prop.
   *
   * @default 56
   */
  count?: number;
  /**
   * Canvas opacity 0 - 1.
   *
   * @default 0.5
   */
  intensity?: number;
  className?: string;
}

const MAX_PARTICLES = 80;
const MAX_DPR = 1.5;

interface Particle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  alpha: number;
}

/**
 * Opt-in ambient dust for the fullscreen player. Performance contract: - devicePixelRatio capped at
 * 1.5 - ONE pre-rendered radial-gradient sprite blitted per particle per frame (no ctx.shadowBlur,
 * no per-frame gradient creation) - the rAF loop is CANCELLED whenever inactive, system-paused or
 * the tab is hidden, and restarted by its owning effects - decorates only; aria-hidden +
 * pointer-events none
 */
export const ParticlesLayer = memo(function ParticlesLayer({
  isActive = false,
  isSystemPaused = false,
  color,
  count = 56,
  intensity = 0.5,
  className = ''
}: ParticlesLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Latest props mirrored into refs so the running loop needs no restarts.
  const liveProps = useRef({ isSystemPaused, color, count, intensity });
  liveProps.current = { isSystemPaused, color, count, intensity };

  // Bridge so the pause effect can start/stop the loop owned below.
  const loopControls = useRef({ start: () => {}, stop: () => {} });

  // Owner effect: canvas sizing, sprite, particle field, rAF lifecycle.
  useEffect(() => {
    if (!isActive) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined; // jsdom / driver-less environments

    let disposed = false;
    let running = false;
    let raf = 0;
    let particles: Particle[] = [];
    let sprite: HTMLCanvasElement | null = null;
    let spriteTint = '';
    let cachedChannels = '';
    let lastColorResolve = Number.NEGATIVE_INFINITY;
    let width = 0;
    let height = 0;
    let hasSized = false;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    const resolveTint = () => {
      // Re-resolve the accent at most twice a second; getComputedStyle is a
      // style read and must never ride the hot path.
      const now = performance.now();
      if (now - lastColorResolve > 500 && !liveProps.current.color) {
        lastColorResolve = now;
        const raw = getComputedStyle(canvas).getPropertyValue('--foreground-color-1').trim();
        if (raw) cachedChannels = raw.split(/\s+/).filter(Boolean).join(' ');
      }
      return liveProps.current.color || cachedChannels || '0 0% 100%';
    };

    const buildSprite = () => {
      const tint = resolveTint();
      if (sprite && spriteTint === tint) return;
      spriteTint = tint;
      sprite = document.createElement('canvas');
      sprite.width = 32;
      sprite.height = 32;
      const sctx = sprite.getContext('2d');
      if (!sctx) return;
      const grad = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, `hsl(${tint} / 0.9)`);
      grad.addColorStop(0.4, `hsl(${tint} / 0.35)`);
      grad.addColorStop(1, `hsl(${tint} / 0)`);
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 32, 32);
    };

    const seedParticles = () => {
      const target = Math.min(liveProps.current.count, MAX_PARTICLES);
      particles = Array.from({ length: target }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 1.5 + Math.random() * 3.5,
        speedY: 0.06 + Math.random() * 0.22,
        swayAmp: 6 + Math.random() * 18,
        swayFreq: 0.0004 + Math.random() * 0.0009,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.25 + Math.random() * 0.5
      }));
    };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const nextWidth = parent.clientWidth;
      const nextHeight = parent.clientHeight;
      // Skip only AFTER the first pass: an initial 0x0 parent must still
      // size+seed (jsdom, hidden mounts), or particles would never exist.
      if (hasSized && nextWidth === width && nextHeight === height) return;
      hasSized = true;

      const seededUnsized = particles.length > 0 && width === 0 && height === 0;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Seed when empty (even against a 0x0 parent), and RESEED once a real
      // size arrives so particles are never left piled at the origin.
      if (particles.length === 0) seedParticles();
      else if (seededUnsized && width > 0) seedParticles();
    };

    const frame = () => {
      // Gate FIRST: a paused/hidden/disposed frame must neither draw nor
      // reschedule - the owning effects restart the loop when lifted.
      if (disposed) return;
      if (liveProps.current.isSystemPaused || document.hidden) {
        stop();
        return;
      }

      if (liveProps.current.count !== particles.length && particles.length > 0) seedParticles();
      buildSprite();
      if (sprite) {
        ctx.clearRect(0, 0, width, height);
        for (const p of particles) {
          p.y -= p.speedY;
          if (p.y < -8) {
            p.y = height + 8;
            p.x = Math.random() * width;
          }
          const swayX = Math.sin(p.phase + performance.now() * p.swayFreq) * p.swayAmp;
          ctx.globalAlpha = liveProps.current.intensity * p.alpha;
          ctx.drawImage(sprite, p.x + swayX - p.size, p.y - p.size, p.size * 2, p.size * 2);
        }
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || disposed) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    loopControls.current = { start, stop };

    resize();
    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    start();

    return () => {
      disposed = true;
      stop();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      loopControls.current = { start: () => {}, stop: () => {} };
    };
  }, [isActive]);

  // Pause effect: fully cancels / restarts the owned loop.
  useEffect(() => {
    if (!isActive) return undefined;
    if (isSystemPaused) loopControls.current.stop();
    else loopControls.current.start();
    return undefined;
  }, [isActive, isSystemPaused]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`fx-particles pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-700 ${className}`.trim()}
      style={{ opacity: isActive ? intensity : 0 }}
    />
  );
});

ParticlesLayer.displayName = 'ParticlesLayer';
export default ParticlesLayer;
