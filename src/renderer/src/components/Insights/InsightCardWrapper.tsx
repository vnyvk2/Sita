import { memo, type ReactNode, useCallback, useRef } from 'react';

interface InsightCardWrapperProps {
  children: ReactNode;
  className?: string;
  glowColor?: 'cyan' | 'fuchsia' | 'amber' | 'rose' | 'violet' | 'emerald';
  holoSheen?: boolean;
}

export const InsightCardWrapper = memo(
  ({ children, className = '', holoSheen = true }: InsightCardWrapperProps) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const sheenRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -6;
      const rotateY = ((x - centerX) / centerX) * 6;

      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01, 1.01, 1.01)`;

      if (sheenRef.current) {
        sheenRef.current.style.opacity = '1';
        sheenRef.current.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255, 255, 255, 0.15) 0%, rgba(6, 182, 212, 0.2) 30%, rgba(236, 72, 153, 0.15) 50%, transparent 70%)`;
      }
    }, []);

    const handleMouseLeave = useCallback(() => {
      const card = cardRef.current;
      if (!card) return;
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      if (sheenRef.current) {
        sheenRef.current.style.opacity = '0';
      }
    }, []);

    return (
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transformStyle: 'preserve-3d',
          transition: 'transform 0.15s ease-out, box-shadow 0.25s ease'
        }}
        className={`relative overflow-hidden rounded-2xl border transition-all ${className}`}
      >
        {holoSheen && (
          <div
            ref={sheenRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 rounded-2xl opacity-0 mix-blend-screen transition-opacity duration-300"
          />
        )}
        <div className="relative z-0 h-full">{children}</div>
      </div>
    );
  }
);

InsightCardWrapper.displayName = 'InsightCardWrapper';
