import { useDebouncedCallback } from '@tanstack/react-pacer';
import { type CSSProperties, type ReactNode, forwardRef, useEffect, useRef, useState } from 'react';
import {
  Virtuoso,
  type Components,
  type ListRange,
  type ScrollSeekConfiguration,
  type ScrollSeekPlaceholderProps,
  type VirtuosoHandle
} from 'react-virtuoso';

import { scrollRegistry } from '../utils/scrollStore';

export const SCROLL_IDLE_MS = 150;
export const MIN_HOLD_MS = 400;

export const DEFAULT_SCROLL_SEEK_CONFIG: ScrollSeekConfiguration = {
  enter: (velocity) => Math.abs(velocity) > 800,
  exit: (velocity) => Math.abs(velocity) < 300
};

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
  onScrollingStateChange?: (isScrolling: boolean) => void;
  scrollSeekConfiguration?: false | ScrollSeekConfiguration;
};

const PRELOADED_ITEM_THROUGH_VIEWPORT_COUNT = 5;

const DefaultScrollSeekPlaceholder = (props: ScrollSeekPlaceholderProps) => (
  <div
    style={{ height: `${props.height}px` }}
    className="relative w-full items-center overflow-hidden opacity-40 select-none"
    aria-hidden="true"
  />
);

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
    onDebouncedScroll,
    onScrollingStateChange,
    scrollSeekConfiguration = false
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

  const resolvedComponents = {
    ...(scrollSeekConfiguration ? { ScrollSeekPlaceholder: DefaultScrollSeekPlaceholder } : {}),
    ...components
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
      overscan={{ main: 1200, reverse: 600 }}
      useWindowScroll={useWindowScroll}
      fixedItemHeight={fixedItemHeight}
      components={resolvedComponents}
      ref={setCombinedVirtuosoRef}
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
      increaseViewportBy={{
        top: fixedItemHeight * PRELOADED_ITEM_THROUGH_VIEWPORT_COUNT,
        bottom: fixedItemHeight * PRELOADED_ITEM_THROUGH_VIEWPORT_COUNT
      }}
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

        // Always notify parent of the currently visible range to keep hydration in sync
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
