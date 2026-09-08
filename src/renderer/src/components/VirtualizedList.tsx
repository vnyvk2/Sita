import { useDebouncedCallback } from '@tanstack/react-pacer';
import { type CSSProperties, type ReactNode, forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  Virtuoso,
  type Components,
  type ListRange,
  type ScrollSeekConfiguration,
  type ScrollSeekPlaceholderProps,
  type VirtuosoHandle
} from 'react-virtuoso';

import { scrollRegistry } from '../utils/scrollStore';
import { scrollTrace } from '../utils/scrollTrace';

export const SCROLL_IDLE_MS = 150;
export const MIN_HOLD_MS = 400;

export const DEFAULT_SCROLL_SEEK_CONFIG: ScrollSeekConfiguration = {
  enter: (velocity) => {
    const shouldEnter = Math.abs(velocity) > 800;
    if (shouldEnter) {
      scrollTrace.onSeek('enter', velocity);
    }
    return shouldEnter;
  },
  exit: (velocity) => {
    const shouldExit = Math.abs(velocity) < 300;
    if (shouldExit) {
      scrollTrace.onSeek('exit', velocity);
    }
    return shouldExit;
  }
};

export const DEFAULT_LIST_OVERSCAN = { main: 300, reverse: 150 };

const EMPTY_COMPONENTS = {};

type Props<T, C = unknown> = {
  data: readonly T[];
  fixedItemHeight: number;
  scrollKey?: string;
  scrollTopOffset?: number;
  initialItemCount?: number;
  itemContent: (index: number, item: T, context: C) => ReactNode;
  components?: Components<T, C>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scrollerRef?: any;
  useWindowScroll?: boolean;
  style?: CSSProperties;
  onChange?: (range: ListRange) => void;
  onDebouncedScroll?: (range: ListRange) => void;
  onScrollingStateChange?: (isScrolling: boolean) => void;
  scrollSeekConfiguration?: false | ScrollSeekConfiguration;
  context?: C;
  increaseViewportBy?: number | { top: number; bottom: number };
  computeItemKey?: (index: number, item: T, context: C) => React.Key;
};

const PRELOADED_ITEM_THROUGH_VIEWPORT_COUNT = 5;

const DefaultScrollSeekPlaceholder = (props: ScrollSeekPlaceholderProps) => (
  <div
    style={{ height: `${props.height}px` }}
    className="relative w-full overflow-hidden select-none"
    aria-hidden="true"
  >
    <div className="bg-background-color-1! dark:bg-dark-background-color-1! mx-3 my-1 flex h-[calc(100%-8px)] items-center gap-2 rounded-lg px-2">
      <div className="bg-background-color-2! dark:bg-dark-background-color-2! aspect-square h-[85%] shrink-0 rounded-md opacity-60" />
      <div className="bg-background-color-2! dark:bg-dark-background-color-2! h-3.5 w-[40%] rounded-full opacity-60" />
    </div>
  </div>
);

const List = <T, C = unknown>(props: Props<T, C>, ref: React.ForwardedRef<VirtuosoHandle>) => {
  const {
    data,
    fixedItemHeight,
    scrollKey,
    scrollTopOffset,
    initialItemCount,
    itemContent,
    components = EMPTY_COMPONENTS as Components<T, C>,
    scrollerRef,
    useWindowScroll = false,
    style,
    onChange,
    onDebouncedScroll,
    onScrollingStateChange,
    scrollSeekConfiguration = DEFAULT_SCROLL_SEEK_CONFIG,
    context,
    increaseViewportBy,
    computeItemKey
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
  const latestRangeRef = useRef<ListRange | undefined>(undefined);

  // Scroller element ref & event listener with lifecycle cleanup
  const [scrollerElement, setScrollerElement] = useState<HTMLElement | null>(null);

  // Keep latest onScrollingStateChange in a ref to avoid recreating listener
  const onScrollingStateChangeRef = useRef(onScrollingStateChange);
  onScrollingStateChangeRef.current = onScrollingStateChange;

  useEffect(() => {
    if (!scrollerElement) return;

    const ac = new AbortController();
    let addedAt = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const removeClass = () => {
      if (scrollerElement.classList.contains('is-scrolling')) {
        scrollerElement.classList.remove('is-scrolling');
        onScrollingStateChangeRef.current?.(false);
        scrollTrace.onScrollStop(latestRangeRef.current);
      }
    };

    const handleScroll = () => {
      currentScrollTopRef.current = scrollerElement.scrollTop;

      // Guard: do not mark as active scrolling during programmatic restoration layout on initial mount
      if (restorationStateRef.current === 'RESTORING') {
        return;
      }

      if (!scrollerElement.classList.contains('is-scrolling')) {
        scrollerElement.classList.add('is-scrolling');
        addedAt = performance.now();
        onScrollingStateChangeRef.current?.(true);
      }

      if (idleTimer) clearTimeout(idleTimer);

      idleTimer = setTimeout(() => {
        const elapsed = performance.now() - addedAt;
        if (elapsed >= MIN_HOLD_MS) {
          removeClass();
        } else {
          idleTimer = setTimeout(removeClass, MIN_HOLD_MS - elapsed);
        }
      }, SCROLL_IDLE_MS);
    };

    scrollerElement.addEventListener('scroll', handleScroll, {
      passive: true,
      signal: ac.signal
    });

    return () => {
      ac.abort();
      scrollerElement.removeEventListener('scroll', handleScroll);
      if (idleTimer) clearTimeout(idleTimer);
      if (scrollerElement.classList.contains('is-scrolling')) {
        scrollerElement.classList.remove('is-scrolling');
        onScrollingStateChangeRef.current?.(false);
      }
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

  const resolvedComponents = useMemo(
    () => ({
      ...(scrollSeekConfiguration ? { ScrollSeekPlaceholder: DefaultScrollSeekPlaceholder } : {}),
      ...components
    }),
    [scrollSeekConfiguration, components]
  );

  const effectiveIncreaseViewportBy = useMemo(
    () =>
      increaseViewportBy ?? {
        top: fixedItemHeight * PRELOADED_ITEM_THROUGH_VIEWPORT_COUNT,
        bottom: fixedItemHeight * PRELOADED_ITEM_THROUGH_VIEWPORT_COUNT
      },
    [increaseViewportBy, fixedItemHeight]
  );

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
      overscan={DEFAULT_LIST_OVERSCAN}
      useWindowScroll={useWindowScroll}
      fixedItemHeight={fixedItemHeight}
      components={resolvedComponents}
      ref={setCombinedVirtuosoRef}
      context={context}
      {...(scrollSeekConfiguration ? { scrollSeekConfiguration } : {})}
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
      increaseViewportBy={effectiveIncreaseViewportBy}
      rangeChanged={(range) => {
        // Guard scroll registry updates while restoring so transient ranges don't overwrite saved position
        if (restorationStateRef.current === 'RESTORING') {
          const target = targetIndexRef.current;
          const isTargetReached =
            (range.startIndex <= target && range.endIndex >= target) ||
            Math.abs(range.startIndex - target) <= 25;

          if (isTargetReached) {
            // Target position reached; transition to normal tracking
            restorationStateRef.current = 'TRACKING';
          }
        }

        if (scrollKey && restorationStateRef.current === 'TRACKING') {
          scrollRegistry.set(scrollKey, {
            index: range.startIndex,
            offset: currentScrollTopRef.current
          });
        }

        latestRangeRef.current = range;
        // Always notify parent of the currently visible range to keep hydration in sync
        if (onChange) onChange(range);
        handleDebouncedScroll(range);
      }}
      {...(computeItemKey ? { computeItemKey } : {})}
      itemContent={itemContent}
    />
  );
};

const VirtualizedList = forwardRef(List) as <T, C = unknown>(
  props: Props<T, C> & { ref?: React.ForwardedRef<VirtuosoHandle> }
) => ReturnType<typeof List>;

export default VirtualizedList;
