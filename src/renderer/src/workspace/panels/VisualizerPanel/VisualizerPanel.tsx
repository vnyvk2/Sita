import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { memo, useEffect, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import type { PanelProps } from '../../registry';

type VisualizerMode = 'bars' | 'wave' | 'dots';

export const VisualizerPanel: FC<PanelProps> = memo(({ api }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cachedGradRef = useRef<CanvasGradient | null>(null);
  const cachedHeightRef = useRef<number>(0);
  const cachedCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const currentSongData = useStore(store, (state) => state.currentSongData);

  // Local panel state persists mode across moves
  const [mode, setMode] = useState<VisualizerMode>(api.getLocal<VisualizerMode>('mode', 'bars'));

  const handleModeChange = (newMode: VisualizerMode) => {
    setMode(newMode);
    api.setLocal('mode', newMode);
  };

  const getCachedGradient = (ctx: CanvasRenderingContext2D, height: number): CanvasGradient => {
    if (
      !cachedGradRef.current ||
      cachedHeightRef.current !== height ||
      cachedCtxRef.current !== ctx
    ) {
      const grad = ctx.createLinearGradient(0, height, 0, 0);
      grad.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
      grad.addColorStop(1, 'rgba(168, 85, 247, 0.9)');
      cachedGradRef.current = grad;
      cachedHeightRef.current = height;
      cachedCtxRef.current = ctx;
    }
    return cachedGradRef.current;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const barCount = 32;

    const drawVisualizer = (values: number[], peaks: number[]) => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Draw based on selected mode
      if (mode === 'bars') {
        const barWidth = (width / barCount) * 0.75;
        const gap = (width / barCount) * 0.25;
        const grad = getCachedGradient(ctx, height);

        // Batch 1: Draw all gradient bars
        ctx.fillStyle = grad;
        for (let i = 0; i < barCount; i++) {
          const x = i * (barWidth + gap) + gap / 2;
          const barHeight = Math.max(4, values[i] * (height - 16));
          const y = height - barHeight;

          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
          ctx.fill();
        }

        // Batch 2: Draw all peak caps with single fillStyle assignment
        ctx.fillStyle = 'rgba(236, 72, 153, 0.85)';
        for (let i = 0; i < barCount; i++) {
          const x = i * (barWidth + gap) + gap / 2;
          const peakY = height - Math.max(6, peaks[i] * (height - 16));
          ctx.fillRect(x, peakY, barWidth, 2);
        }
      } else if (mode === 'wave') {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.9)';
        ctx.lineWidth = 2.5;

        const sliceWidth = width / (barCount - 1);
        for (let i = 0; i < barCount; i++) {
          const x = i * sliceWidth;
          const y = height / 2 + (values[i] - 0.5) * (height * 0.7);
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      } else if (mode === 'dots') {
        ctx.fillStyle = 'rgba(99, 102, 241, 0.9)';
        const step = width / barCount;
        for (let i = 0; i < barCount; i++) {
          const x = i * step + step / 2;
          const y = height - Math.max(8, values[i] * (height - 20));
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const isPlaying = Boolean(isCurrentSongPlaying && currentSongData?.songId);

    // If not playing or no track, render one final idle frame and stop the loop
    if (!isPlaying) {
      drawVisualizer(new Array(barCount).fill(0.05), new Array(barCount).fill(0.05));
      return;
    }

    let animId: number;
    const values = new Array(barCount).fill(0.05);
    const peaks = new Array(barCount).fill(0.05);

    const renderFrame = () => {
      // Generate animated pseudo-frequency data
      for (let i = 0; i < barCount; i++) {
        const target =
          Math.sin(Date.now() * 0.005 + i * 0.4) * 0.35 + 0.45 + (Math.random() * 0.2 - 0.1);
        values[i] += (target - values[i]) * 0.25;

        if (values[i] > peaks[i]) {
          peaks[i] = values[i];
        } else {
          peaks[i] = Math.max(0.05, peaks[i] - 0.008);
        }
      }

      drawVisualizer(values, peaks);

      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isCurrentSongPlaying, currentSongData?.songId, mode]);

  return (
    <div className="visualizer-panel bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-black dark:text-font-color-white flex h-full w-full flex-col overflow-hidden">
      {/* Visualizer Mode Selector */}
      <div className="bg-background-color-2/30 dark:bg-dark-background-color-2/30 flex shrink-0 items-center justify-between border-b border-stone-200/50 px-3 py-2 dark:border-stone-800/50">
        <span className="text-font-color-dimmed text-xs font-semibold">
          {t('player.visualizer', 'Audio Spectrum')}
        </span>

        <div className="flex items-center gap-1">
          {(['bars', 'wave', 'dots'] as VisualizerMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              className={`cursor-pointer rounded px-2 py-0.5 text-[10px] font-medium capitalize transition-colors ${
                mode === m
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-font-color-dimmed hover:bg-stone-200 dark:hover:bg-stone-800'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas container */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3">
        <canvas
          ref={canvasRef}
          width={360}
          height={180}
          className="bg-background-color-2/20 dark:bg-dark-background-color-2/20 h-full max-h-[300px] w-full rounded-xl object-contain"
        />
      </div>
    </div>
  );
});

VisualizerPanel.displayName = 'VisualizerPanel';
export default VisualizerPanel;
