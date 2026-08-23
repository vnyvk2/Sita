import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

type Props = {
  title: string;
  className?: string;
  speed?: number; // pixels per second for the scroll phase, default 40
};

const ScrollableTitle = ({ title, className = '', speed = 40 }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [overflowDistance, setOverflowDistance] = useState(0);

  const checkOverflow = useCallback(() => {
    if (containerRef.current && measureRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const textWidth = measureRef.current.offsetWidth || measureRef.current.scrollWidth;
      if (textWidth > containerWidth && containerWidth > 0) {
        setIsOverflowing(true);
        setOverflowDistance(textWidth - containerWidth + 12); // +12px buffer for breathing room
      } else {
        setIsOverflowing(false);
        setOverflowDistance(0);
      }
    }
  }, []);

  useEffect(() => {
    checkOverflow();

    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      checkOverflow();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [title, checkOverflow]);

  // The @keyframes marqueeScroll uses 30% of totalDuration for each scroll phase (20%->50% and 70%->100%)
  const scrollTime = overflowDistance / speed;
  const totalDuration = Math.max(4, scrollTime / 0.3);

  const customStyle: CSSProperties & { [key: string]: string | number } = {
    '--marquee-dist': `-${overflowDistance}px`,
    '--marquee-duration': `${totalDuration}s`
  };

  return (
    <div
      ref={containerRef}
      className={`group relative w-full min-w-0 overflow-hidden ${className}`}
      onMouseEnter={() => {
        checkOverflow();
        setIsHovered(true);
      }}
      onMouseLeave={() => setIsHovered(false)}
      style={customStyle}
    >
      {/* Invisible measurement probe for 100% stable intrinsic text width calculation */}
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute whitespace-nowrap select-none"
      >
        {title}
      </span>

      {/* Visible display element */}
      <div
        className={`whitespace-nowrap ${
          isOverflowing && isHovered
            ? 'animate-marquee-scroll inline-block w-max'
            : 'block w-full truncate'
        }`}
      >
        {title}
      </div>
    </div>
  );
};

export default ScrollableTitle;
