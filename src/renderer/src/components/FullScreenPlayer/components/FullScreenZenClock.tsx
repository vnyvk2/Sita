import { memo, useEffect, useState } from 'react';

interface FullScreenZenClockProps {
  isVisible: boolean;
  isIdle: boolean;
}

const formatClock = (now: Date) => {
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  return { time: `${hours}:${minutes}`, dateLabel };
};

export const FullScreenZenClock = memo(({ isVisible, isIdle }: FullScreenZenClockProps) => {
  const [clockState, setClockState] = useState(() => formatClock(new Date()));

  useEffect(() => {
    if (!isVisible) return undefined;
    setClockState(formatClock(new Date()));
    const interval = setInterval(() => {
      setClockState(formatClock(new Date()));
    }, 15000);
    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div
      data-testid="fullscreen-zen-clock"
      aria-label={`Current time ${clockState.time}`}
      className={`pointer-events-none absolute right-8 z-30 flex flex-col items-end transition-all duration-500 select-none ${
        isIdle ? 'top-8 opacity-85' : 'top-14 opacity-75'
      }`}
    >
      <div className="font-mono text-3xl leading-none font-light tracking-widest text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] sm:text-4xl">
        {clockState.time}
      </div>
      <div className="mt-1 text-[11px] font-medium tracking-widest text-white/55 uppercase">
        {clockState.dateLabel}
      </div>
    </div>
  );
});

FullScreenZenClock.displayName = 'FullScreenZenClock';
export default FullScreenZenClock;
