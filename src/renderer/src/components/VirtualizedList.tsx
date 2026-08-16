import { useDebouncedCallback } from '@tanstack/react-pacer';
import { type CSSProperties, type ReactNode, forwardRef, useEffect, useRef } from 'react';
import { Virtuoso, type Components, type ListRange, type VirtuosoHandle } from 'react-virtuoso';

import { scrollRegistry } from '../utils/scrollStore';

type Props<T extends object> = {
  data: T[];
  fixedItemHeight: number;
  scrollKey?: string;
  scrollTopOffset?: number;
  itemContent: (index: number, item: T) => ReactNode;
  components?: Components<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scrollerRef?: any;
  useWindowScroll?: boolean;
  style?: CSSProperties;
  onChange?: (range: ListRange) => void;
  onDebouncedScroll?: (range: ListRange) => void;
};

const PRELOADED_ITEM_THROUGH_VIEWPORT_COUNT = 5;

const List = <T extends object>(props: Props<T>, ref) => {
  const {
    data,
    fixedItemHeight,
    scrollKey,
    scrollTopOffset,
    itemContent,
    components = {},
    scrollerRef,
    useWindowScroll = false,
    style,
    onChange,
    onDebouncedScroll
  } = props;

  // Retrieve initial saved position for scrollKey if available
  const savedPosition = scrollKey ? scrollRegistry.get(scrollKey) : undefined;
  const initialIndex =
    typeof scrollTopOffset === 'number' ? scrollTopOffset : (savedPosition?.index ?? 0);
  const initialOffset = savedPosition?.offset;

  // Lifecycle restoration state machine: RESTORING -> TRACKING
  const restorationStateRef = useRef<'RESTORING' | 'TRACKING'>(
    initialIndex > 0 ? 'RESTORING' : 'TRACKING'
  );
  const targetIndexRef = useRef<number>(initialIndex);
  const currentScrollTopRef = useRef<number | undefined>(initialOffset);
  const currentScrollKeyRef = useRef<string | undefined>(scrollKey);

  // When scrollKey changes (e.g. filter/sort change), update restoration lifecycle
  useEffect(() => {
    if (currentScrollKeyRef.current !== scrollKey) {
      currentScrollKeyRef.current = scrollKey;
      const newSavedPosition = scrollKey ? scrollRegistry.get(scrollKey) : undefined;
      const newTarget =
        typeof scrollTopOffset === 'number' ? scrollTopOffset : (newSavedPosition?.index ?? 0);

      targetIndexRef.current = newTarget;
      currentScrollTopRef.current = newSavedPosition?.offset;
      restorationStateRef.current = newTarget > 0 ? 'RESTORING' : 'TRACKING';
    }
  }, [scrollKey, scrollTopOffset]);

  const handleDebouncedScroll = useDebouncedCallback(
    (range: ListRange) => {
      if (onDebouncedScroll) {
        onDebouncedScroll(range);
      }
    },
    { wait: 2500 }
  );

  const initialTopMost =
    initialIndex > 0
      ? initialOffset !== undefined
        ? { index: initialIndex, offset: initialOffset }
        : initialIndex
      : undefined;

  return (
    <Virtuoso
      style={
        useWindowScroll
          ? { ...style }
          : {
              width: '100%',
              height: '100%',
              ...style
            }
      }
      data={data}
      overscan={25}
      useWindowScroll={useWindowScroll}
      fixedItemHeight={fixedItemHeight}
      components={{
        ...components
      }}
      ref={ref}
      {...(initialTopMost !== undefined ? { initialTopMostItemIndex: initialTopMost } : {})}
      scrollerRef={(element) => {
        if (typeof scrollerRef === 'function') {
          scrollerRef(element);
        } else if (scrollerRef && typeof scrollerRef === 'object') {
          scrollerRef.current = element;
        }

        if (element && 'addEventListener' in element) {
          const handleScroll = () => {
            if ('scrollTop' in element) {
              currentScrollTopRef.current = (element as HTMLElement).scrollTop;
            }
          };
          element.addEventListener('scroll', handleScroll, { passive: true });
        }
      }}
      increaseViewportBy={{
        top: fixedItemHeight * PRELOADED_ITEM_THROUGH_VIEWPORT_COUNT,
        bottom: fixedItemHeight * PRELOADED_ITEM_THROUGH_VIEWPORT_COUNT
      }}
      rangeChanged={(range) => {
        // Guard: if currently restoring, ignore initial transient range events (e.g. 0 on mount)
        if (restorationStateRef.current === 'RESTORING') {
          if (
            range.startIndex < targetIndexRef.current &&
            range.endIndex < targetIndexRef.current
          ) {
            return;
          }
          // Target position reached; transition to normal tracking
          restorationStateRef.current = 'TRACKING';
        }

        if (scrollKey && restorationStateRef.current === 'TRACKING') {
          scrollRegistry.set(scrollKey, {
            index: range.startIndex,
            offset: currentScrollTopRef.current
          });
        }

        if (onChange) onChange(range);
        handleDebouncedScroll(range);
      }}
      itemContent={itemContent}
    />
  );
};

const VirtualizedList = forwardRef(List) as <T extends object>(
  props: Props<T> & { ref?: React.ForwardedRef<VirtuosoHandle> }
) => ReturnType<typeof List>;

export default VirtualizedList;
