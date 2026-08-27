import { memo } from 'react';

/**
 * Nora-signature dot-matrix take on the "insights" motif: four columns of
 * dots forming an ascending trend. Static at rest; on hover of the parent
 * `.insights` sidebar item the mark scales up slightly and the column peaks
 * ripple upward (pure CSS, compositor-only, honors reduced motion).
 */
const COLUMN_DOT_COUNTS = [2, 3, 2, 4];

const InsightsIcon = memo(function InsightsIcon({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`fx-insights ${className}`.trim()}>
      {COLUMN_DOT_COUNTS.map((dotCount, col) => (
        <span key={col} className="fx-insights__col">
          {Array.from({ length: dotCount }, (_, row) => (
            <span
              key={row}
              className="fx-insights__dot"
              style={{ opacity: 0.4 + (0.6 * (row + 1)) / dotCount }}
            />
          ))}
        </span>
      ))}
    </span>
  );
});

InsightsIcon.displayName = 'InsightsIcon';
export default InsightsIcon;
