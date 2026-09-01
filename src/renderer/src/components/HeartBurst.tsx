import type React from 'react';

export interface HeartBurstProps {
  isBursting: boolean;
}

/**
 * Renders diverse floating mini hearts and micro-sparks for Design 3 (Multi-Tier Float).
 * Automatically unmounts when not bursting to maintain zero runtime overhead.
 */
export const HeartBurst: React.FC<HeartBurstProps> = ({ isBursting }) => {
  if (!isBursting) return null;

  return (
    <span
      className="fx-heart-burst pointer-events-none absolute inset-0 flex items-center justify-center font-sans select-none"
      aria-hidden="true"
    >
      {/* 6 Diverse floating mini hearts with staggered delays and organic paths */}
      <span className="fx-float-heart m-hero">{'\u2665'}</span>
      <span className="fx-float-heart m-mid1">{'\u2665'}</span>
      <span className="fx-float-heart m-mid2">{'\u2665'}</span>
      <span className="fx-float-heart m-tiny1">{'\u2665'}</span>
      <span className="fx-float-heart m-tiny2">{'\u2665'}</span>
      <span className="fx-float-heart m-micro">{'\u2665'}</span>
    </span>
  );
};

export default HeartBurst;
