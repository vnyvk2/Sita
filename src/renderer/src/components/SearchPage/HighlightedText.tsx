import { memo } from 'react';

const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Props = {
  text: string;
  highlight: string;
  className?: string;
};

/**
 * Renders text with the matching portion highlighted via a styled `<mark>` tag.
 * Used in search result containers to visually indicate what part of a title/name
 * matched the search query.
 */
const HighlightedText = memo(({ text, highlight, className }: Props) => {
  if (!highlight.trim()) return <span className={className}>{text}</span>;

  const regex = new RegExp(`(${escapeRegex(highlight)})`, 'gi');
  const parts = text.split(regex);
  const lowerHighlight = highlight.toLowerCase();

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.toLowerCase() === lowerHighlight ? (
          <mark
            key={i}
            className="bg-font-color-highlight/20 dark:bg-dark-font-color-highlight/20 rounded-sm text-inherit"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
});

HighlightedText.displayName = 'HighlightedText';

export default HighlightedText;
