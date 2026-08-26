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
   * Extra system pause (battery saver etc.). Independent from isActive so a paused player and a
   * disabled pref are distinguishable in devtools.
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

/**
 * Opt-in ambient dust for the fullscreen player. Performance contract: - devicePixelRatio capped at
 * 1.5 - ONE pre-rendered radial-gradient sprite blitted per particle per frame (no ctx.shadowBlur,
 * no per-frame gradient creation) - rAF cancelled entirely when inactive, system-paused, or tab
 * hidden - decorates only; aria-hidden + pointer-events none
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

  useEffect(() => {
    if (!isActive) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined; // jsdom / driver-less environments

    let particles: {
      x: number;
      y: number;
      size: number;
      speedY: number;
      swayAmp: number;
      swayFreq: number;
      phase: number;
      alpha: number;
    }[] = [];
    let sprite: HTMLCanvasElement | null = null;
    let spriteColor = '';
    let cachedChannels = '';
    let lastColorResolve = Number.NEGATIVE_INFINITY;
    let width = 0;
    let height = 0;
    let raf = 0;
    let disposed = false;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    const buildSprite = () => {
      // Re-resolve the accent at most twice a second; getComputedStyle is a
      // style read and must never ride the hot path.
      const now = performance.now();
      if (now - lastColorResolve > 500 && !liveProps.current.color) {
        lastColorResolve = now;
        const raw = getComputedStyle(canvas).getPropertyValue('--foreground-color-1').trim();
        if (raw) cachedChannels = raw.split(/\s+/).filter(Boolean).join(' ');
      }
      const c = liveProps.current.color || cachedChannels || '0 0% 100%';
      if (sprite && spriteColor === c) return;
      spriteColor = c;
      sprite = document.createElement('canvas');
      sprite.width = 32;
      sprite.height = 32;
      const sctx = sprite.getContext('2d');
      if (!sctx) return;
      const grad = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, `hsl(${c} / 0.9)`);
      grad.addColorStop(0.4, `hsl(${c} / 0.35)`);
      grad.addColorStop(1, `hsl(${c} / 0)`);
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
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particles.length === 0) seedParticles();
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!ctx) return;
      if (liveProps.current.isSystemPaused || document.hidden || disposed) return;

      buildSprite();
      if (!sprite) return;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = liveProps.current.intensity;

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
    };

    resize();
    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

    const start = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    };
    start();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
    };
  }, [isActive]);

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
