import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { MetadataGap } from './metadataGaps';

interface MetadataGapBadgeProps {
  gaps: MetadataGap[];
  onFix: () => void;
}

/**
 * Single subtle dot flagging incomplete metadata. Renders nothing when the song is complete, so
 * complete libraries pay zero DOM cost.
 */
const MetadataGapBadge = memo(({ gaps, onFix }: MetadataGapBadgeProps) => {
  const { t } = useTranslation();

  const hint = useMemo(() => {
    if (gaps.length === 0) return '';
    const names = gaps
      .map((g) =>
        g === 'genre'
          ? t('song.gapGenre')
          : g === 'year'
            ? t('song.gapYear')
            : g === 'artwork'
              ? t('song.gapArtwork')
              : t('song.gapArtist')
      )
      .join(', ');
    return t('song.metadataGapsHint', { gaps: names });
  }, [gaps, t]);

  if (gaps.length === 0) return null;

  return (
    <button
      type="button"
      title={hint}
      aria-label={t('song.metadataGapsLabel')}
      onClick={(e) => {
        e.stopPropagation();
        onFix();
      }}
      // 20px transparent hit area around the 6px dot for pointer comfort.
      className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 transition-transform duration-150 hover:scale-110 active:scale-95"
    >
      <span className="bg-font-color-highlight/70 block h-1.5 w-1.5 rounded-full" />
    </button>
  );
});

MetadataGapBadge.displayName = 'MetadataGapBadge';

export default MetadataGapBadge;
