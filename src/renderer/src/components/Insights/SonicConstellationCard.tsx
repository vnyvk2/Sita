import { memo, useEffect, useRef } from 'react';

import type { TopArtistItem } from '../../queries/analytics';
import { InsightCardWrapper } from './InsightCardWrapper';

interface SonicConstellationCardProps {
  topArtists: TopArtistItem[];
}

export const SonicConstellationCard = memo(({ topArtists }: SonicConstellationCardProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    const colors = ['#06b6d4', '#ec4899', '#a855f7', '#f59e0b', '#10b981'];
    const planets = topArtists.slice(1, 5).map((a, idx) => ({
      name: a.name,
      r: 28 + (idx + 1) * 16,
      speed: 0.015 / (idx + 1),
      size: Math.max(3, 6 - idx),
      color: colors[idx % colors.length]
    }));

    const render = () => {
      ctx.clearRect(0, 0, w, h);
      t += 1;

      // Central Star (Top Artist)
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#8b5cf6';
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw Orbits & Planets
      planets.forEach((p) => {
        // Orbit ring
        ctx.beginPath();
        ctx.arc(cx, cy, p.r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Planet position
        const angle = t * p.speed;
        const px = cx + Math.cos(angle) * p.r;
        const py = cy + Math.sin(angle) * p.r;

        // Laser thread
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.stroke();

        // Planet body
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [topArtists]);

  const topArtistName = topArtists[0]?.name ?? 'None';

  return (
    <InsightCardWrapper
      glowColor="violet"
      className="border-background-color-2/70 bg-background-color-1/80 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 flex flex-col justify-between p-5 shadow-sm backdrop-blur-md transition-all hover:border-violet-500/40"
    >
      <div>
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
              <span className="material-icons-round text-lg">blur_on</span>
            </span>
            <div>
              <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
                Sonic Constellation
              </span>
              <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px]">
                Top Artist Planetary System
              </p>
            </div>
          </div>
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-violet-600 dark:text-violet-400">
            Orbital
          </span>
        </div>

        {/* Canvas Display */}
        <div className="border-background-color-2/40 bg-background-color-2/20 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-2/20 relative flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border">
          <canvas ref={canvasRef} width={280} height={160} className="h-full w-full" />
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed bg-background-color-1/70 dark:bg-dark-background-color-1/70 pointer-events-none absolute right-2 bottom-2 rounded px-1.5 py-0.5 font-mono text-[9px] backdrop-blur-sm">
            Top Artists Orbiting
          </div>
        </div>

        <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-3 text-center text-xs">
          Center Star: <strong className="text-violet-500">{topArtistName}</strong>
        </p>
      </div>

      {/* Footer Info */}
      <div className="border-background-color-2/60 dark:border-dark-background-color-2/60 text-font-color-dimmed dark:text-dark-font-color-dimmed mt-4 flex items-center justify-between border-t pt-3 text-[11px]">
        <span>
          Solar Orbit:{' '}
          <strong className="font-semibold text-violet-500">{topArtists.length} Systems</strong>
        </span>
        <span className="font-medium text-violet-500">Harmonic Balance</span>
      </div>
    </InsightCardWrapper>
  );
});

SonicConstellationCard.displayName = 'SonicConstellationCard';
