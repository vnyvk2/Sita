import { type MutableRefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import debounce from '../utils/debounce';

export default function useResizeObserver(
  elRef: MutableRefObject<HTMLElement | null | undefined>,
  debounceTimeout?: number
) {
  const [breakSize, setBreakSize] = useState({ width: 0, height: 0 });

  const debouncedSetBreakSize = useMemo(() => {
    if (debounceTimeout === undefined || debounceTimeout === 0) {
      return null;
    }
    return debounce((size: { width: number; height: number }) => {
      setBreakSize(size);
    }, debounceTimeout);
  }, [debounceTimeout]);

  useEffect(() => {
    return () => {
      debouncedSetBreakSize?.cancel();
    };
  }, [debouncedSetBreakSize]);

  const observer = useRef(
    new ResizeObserver((entries) => {
      // Only care about the first element, we expect one element to be watched
      const { width, height } = entries[0].contentRect;
      if (debouncedSetBreakSize) {
        debouncedSetBreakSize({ width, height });
      } else {
        setBreakSize({ width, height });
      }
    })
  );

  useLayoutEffect(() => {
    const currentObserver = observer.current;
    if (elRef && elRef.current) {
      observer.current.observe(elRef.current);
    }

    return () => {
      currentObserver.disconnect();
    };
  }, [elRef, observer]);

  return breakSize;
}
