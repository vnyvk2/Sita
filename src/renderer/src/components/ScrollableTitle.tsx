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
      const textWidth = Math.ceil(
        measureRef.current.getBoundingClientRect().width || measureRef.current.scrollWidth
      );
      if (textWidth > containerWidth && containerWidth > 0) {
        setIsOverflowing(true);
        setOverflowDistance(textWidth - containerWidth + 16); // +16px buffer for breathing room
      } else {
        setIsOverflowing(false);
        setOverflowDistance(0);
      }
    }
  }, []);

  useEffect(() => {
    checkOverflow();

    // Check when fonts finish loading to avoid fallback-font measurement skew
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        checkOverflow();
      });
    }

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

  const handleMouseEnter = () => {
    // Immediate measurement check on mouse entry
    if (containerRef.current && measureRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const textWidth = Math.ceil(
        measureRef.current.getBoundingClientRect().width || measureRef.current.scrollWidth
      );
      if (textWidth > containerWidth && containerWidth > 0) {
        const dist = textWidth - containerWidth + 16;
        setOverflowDistance(dist);
        setIsOverflowing(true);
        setIsHovered(true);
        return;
      }
    }
    setIsOverflowing(false);
    setIsHovered(false);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  // Duration scales proportionally with scroll distance, keeping pauses concise (~0.8s)
  const scrollTime = overflowDistance / speed;
  const totalDuration = Math.max(3, scrollTime * 2 + 2.4);

  const customStyle: CSSProperties & { [key: string]: string | number } = {
    '--marquee-dist': `-${overflowDistance}px`,
    '--marquee-duration': `${totalDuration}s`
  };

  return (
    <div
      ref={containerRef}
      className={`group relative w-full min-w-0 overflow-hidden ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={customStyle}
    >
      {/* Invisible measurement probe with unconstrained w-max for 100% stable intrinsic width */}
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 w-max max-w-none whitespace-nowrap select-none"
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
