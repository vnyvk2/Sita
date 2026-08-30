import { memo } from 'react';

/**
 * Animated Material `auto_graph` icon for the Home tab Insights button. Renders the authentic
 * trendline graph with its 3 discrete sparkle dots. On hover, the 3 dots perform a smooth, magical
 * floating and twinkling wave.
 */
const AutoGraphIcon = memo(function AutoGraphIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`fx-auto-graph-icon h-5 w-5 ${className}`.trim()}
      aria-hidden="true"
    >
      {/* The Graph Line */}
      <path
        className="fx-auto-graph-line"
        d="M3.41 18.5l6.5-6.5 4 4 7.18-8.1-1.42-1.42-5.76 6.5-4-4-7.92 7.92 1.42 1.42z"
      />

      {/* Sparkle Dot 1 (Left) */}
      <path
        className="fx-auto-graph-dot fx-auto-graph-dot-1"
        d="M4 14l.94-2.06L7 11l-2.06-.94L4 8l-.94 2.06L1 11l2.06.94L4 14z"
      />

      {/* Sparkle Dot 2 (Top Middle) */}
      <path
        className="fx-auto-graph-dot fx-auto-graph-dot-2"
        d="M8.5 9l.94-2.06L11.5 6l-2.06-.94L8.5 3l-.94 2.06L5.5 6l2.06.94L8.5 9z"
      />

      {/* Sparkle Dot 3 (Right) */}
      <path
        className="fx-auto-graph-dot fx-auto-graph-dot-3"
        d="M14.06 9.94L12 9l2.06-.94L15 6l.94 2.06L18 9l-2.06.94L15 12l-.94-2.06z"
      />
    </svg>
  );
});

AutoGraphIcon.displayName = 'AutoGraphIcon';
export default AutoGraphIcon;
