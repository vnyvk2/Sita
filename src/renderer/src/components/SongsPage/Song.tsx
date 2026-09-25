import { type ForwardedRef, forwardRef, memo } from 'react';

import CompactSongRow from './CompactSongRow';
import StandardSongRow, { type SongProp } from './StandardSongRow';

export type { SongProp };

export const Song = memo(
  forwardRef((props: SongProp, ref: ForwardedRef<HTMLDivElement>) => {
    if (props.isCompact) {
      return <CompactSongRow ref={ref} {...props} />;
    }
    return <StandardSongRow ref={ref} {...props} />;
  })
);

Song.displayName = 'Song';
export default Song;
