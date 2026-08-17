import { useDebouncedCallback } from '@tanstack/react-pacer';
import { type CSSProperties, type ReactNode, forwardRef, useEffect, useRef, useState } from 'react';
import { Virtuoso, type Components, type ListRange, type VirtuosoHandle } from 'react-virtuoso';

import { scrollRegistry } from '../utils/scrollStore';

type Props<T> = {
  data: readonly T[];
  fixedItemHeight: number;
  scrollKey?: string;
  scrollTopOffset?: number;
  initialItemCount?: number;
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

const List = <T,>(props: Props<T>, ref: React.ForwardedRef<VirtuosoHandle>) => {
  const {
    data,
    fixedItemHeight,
    scrollKey,
    scrollTopOffset,
    initialItemCount,
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
  const isInitialMountRef = useRef<boolean>(true);
  const innerVirtuosoRef = useRef<VirtuosoHandle | null>(null);

  // Scroller element ref & event listener with lifecycle cleanup
  const [scrollerElement, setScrollerElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!scrollerElement) return;

    const handleScroll = () => {
      currentScrollTopRef.current = scrollerElement.scrollTop;
    };

    scrollerElement.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollerElement.removeEventListener('scroll', handleScroll);
    };
  }, [scrollerElement]);

  // Imperative restoration when scrollKey changes on an already-mounted list
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    if (currentScrollKeyRef.current !== scrollKey) {
      currentScrollKeyRef.current = scrollKey;
      const newSavedPosition = scrollKey ? scrollRegistry.get(scrollKey) : undefined;
      const newTarget =
        typeof scrollTopOffset === 'number' ? scrollTopOffset : (newSavedPosition?.index ?? 0);

      targetIndexRef.current = newTarget;
      currentScrollTopRef.current = newSavedPosition?.offset;
      restorationStateRef.current = newTarget > 0 ? 'RESTORING' : 'TRACKING';

      // Imperatively scroll Virtuoso to the restored position for the new dataset key
      if (innerVirtuosoRef.current) {
        innerVirtuosoRef.current.scrollToIndex({
          index: newTarget,
          align: 'start',
          behavior: 'auto',
          ...(newSavedPosition?.offset !== undefined ? { offset: newSavedPosition.offset } : {})
        });
      }
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

  const setCombinedVirtuosoRef = (handle: VirtuosoHandle | null) => {
    innerVirtuosoRef.current = handle;
    if (typeof ref === 'function') {
      ref(handle);
    } else if (ref && typeof ref === 'object') {
      (ref as React.MutableRefObject<VirtuosoHandle | null>).current = handle;
    }
  };

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
      ref={setCombinedVirtuosoRef}
      {...(initialItemCount !== undefined ? { initialItemCount } : {})}
      {...(initialTopMost !== undefined ? { initialTopMostItemIndex: initialTopMost } : {})}
      scrollerRef={(element) => {
        if (typeof scrollerRef === 'function') {
          scrollerRef(element);
        } else if (scrollerRef && typeof scrollerRef === 'object') {
          scrollerRef.current = element;
        }

        if (element instanceof HTMLElement) {
          setScrollerElement(element);
        } else {
          setScrollerElement(null);
        }
      }}
      increaseViewportBy={{
        top: fixedItemHeight * PRELOADED_ITEM_THROUGH_VIEWPORT_COUNT,
        bottom: fixedItemHeight * PRELOADED_ITEM_THROUGH_VIEWPORT_COUNT
      }}
      rangeChanged={(range) => {
        // Guard: if currently restoring, ignore transient intermediate ranges until target is reached
        if (restorationStateRef.current === 'RESTORING') {
          const target = targetIndexRef.current;
          const isTargetReached = range.startIndex <= target && range.endIndex >= target;

          if (!isTargetReached) {
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

const VirtualizedList = forwardRef(List) as <T>(
  props: Props<T> & { ref?: React.ForwardedRef<VirtuosoHandle> }
) => ReturnType<typeof List>;

export default VirtualizedList;
