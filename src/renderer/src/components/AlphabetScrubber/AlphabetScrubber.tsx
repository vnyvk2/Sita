import { memo, useCallback, useMemo, useRef } from 'react';
import { twMerge } from 'tailwind-merge';

export interface AlphabetScrubberProps {
  alphabetMap?: Record<string, number>;
  letterCounts?: Record<string, number>;
  position: 'top-horizontal' | 'left-vertical';
  sortOrder: 'aToZ' | 'zToA';
  activeLetter?: string;
  onSelectLetter: (letter: string, targetIndex: number) => void;
  className?: string;
}

const STANDARD_LETTERS = [
  '#',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'
];

export const AlphabetScrubber = memo((props: AlphabetScrubberProps) => {
  const {
    alphabetMap,
    letterCounts,
    position,
    sortOrder,
    activeLetter,
    onSelectLetter,
    className
  } = props;

  const isDraggingRef = useRef<boolean>(false);
  const lastDispatchedLetterRef = useRef<string | null>(null);

  const letters = useMemo(() => {
    return sortOrder === 'zToA'
      ? [...STANDARD_LETTERS.slice(1).reverse(), '#']
      : STANDARD_LETTERS;
  }, [sortOrder]);

  const handlePointerLetter = useCallback(
    (clientX: number, clientY: number) => {
      if (!alphabetMap) return;
      const element = document.elementFromPoint(clientX, clientY);
      const letterBtn = element?.closest<HTMLButtonElement>('[data-letter]');
      if (!letterBtn) return;

      const letter = letterBtn.getAttribute('data-letter');
      if (!letter) return;

      const targetIndex = alphabetMap[letter];
      if (typeof targetIndex === 'number' && letter !== lastDispatchedLetterRef.current) {
        lastDispatchedLetterRef.current = letter;
        onSelectLetter(letter, targetIndex);
      }
    },
    [alphabetMap, onSelectLetter]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // Pointer capture unsupported or failed
      }
      isDraggingRef.current = true;
      handlePointerLetter(e.clientX, e.clientY);
    },
    [handlePointerLetter]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      handlePointerLetter(e.clientX, e.clientY);
    },
    [handlePointerLetter]
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    lastDispatchedLetterRef.current = null;
    try {
      if (typeof e.currentTarget.hasPointerCapture === 'function') {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } else {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
    } catch {
      // Ignore pointer capture release error
    }
  }, []);

  const isHorizontal = position === 'top-horizontal';

  return (
    <nav
      aria-label="Alphabet Navigation"
      className={twMerge(
        'select-none touch-none',
        isHorizontal
          ? 'w-full flex items-center justify-between overflow-x-auto py-1 px-2 mb-2 bg-background-color-1/60 dark:bg-dark-background-color-1/60 rounded-lg border border-background-color-2/40 dark:border-dark-background-color-2/40'
          : 'flex flex-col items-center justify-between py-2 px-1 w-6 h-full shrink-0 border-r border-background-color-2/40 dark:border-dark-background-color-2/40 mr-1',
        className
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {letters.map((letter) => {
        const hasSongs = alphabetMap?.[letter] !== undefined;
        const count = letterCounts?.[letter];
        const isActive = activeLetter === letter;
        const targetIndex = alphabetMap?.[letter];

        const label = count !== undefined
          ? `${letter}: ${count} songs`
          : `Jump to ${letter}`;

        return (
          <button
            key={letter}
            type="button"
            data-letter={letter}
            disabled={!hasSongs}
            aria-disabled={!hasSongs}
            aria-label={label}
            title={hasSongs ? label : `${letter}: 0 songs`}
            tabIndex={hasSongs ? 0 : -1}
            onClick={() => {
              if (hasSongs && typeof targetIndex === 'number') {
                onSelectLetter(letter, targetIndex);
              }
            }}
            className={twMerge(
              'flex items-center justify-center font-medium transition-colors cursor-pointer rounded-xs focus:outline-hidden',
              isHorizontal
                ? 'px-1 py-0.5 text-xs min-w-[20px] h-6'
                : 'w-5 h-4 text-[10px] leading-none my-[1px]',
              hasSongs
                ? isActive
                  ? 'bg-font-color-highlight text-white dark:text-dark-background-color-1 font-bold shadow-xs'
                  : 'text-font-color-highlight dark:text-dark-font-color-highlight hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 hover:text-font-color-black dark:hover:text-dark-font-color-white'
                : 'opacity-25 text-font-color-dim dark:text-dark-font-color-dim cursor-default pointer-events-none'
            )}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
});

AlphabetScrubber.displayName = 'AlphabetScrubber';
export default AlphabetScrubber;
