import { useDebouncedCallback } from '@tanstack/react-pacer';
import { type CSSProperties, type ReactNode, forwardRef, useEffect, useMemo, useRef } from 'react';
import {
  type GridComponents,
  type ListRange,
  VirtuosoGrid,
  type VirtuosoGridHandle
} from 'react-virtuoso';

import { scrollRegistry } from '../utils/scrollStore';

type Props<T extends object> = {
  data: T[];
  fixedItemHeight: number;
  fixedItemWidth: number;
  scrollKey?: string;
  scrollTopOffset?: number;
  itemContent: (index: number, item: T) => ReactNode;
  components?: GridComponents<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scrollerRef?: any;
  useWindowScroll?: boolean;
  style?: CSSProperties;
  noRangeUpdates?: boolean;
  onChange?: (range: ListRange) => void;
  onDebouncedScroll?: (range: ListRange) => void;
};

const PRELOADED_ITEM_THROUGH_VIEWPORT_COUNT = 5;

const Grid = <T extends object>(props: Props<T>, ref) => {
  const {
    data,
    fixedItemHeight,
    fixedItemWidth,
    scrollKey,
    scrollTopOffset,
    itemContent,
    components = {},
    scrollerRef,
    useWindowScroll = false,
    style: mainStyle,
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

  const gridComponents = useMemo(
    () => ({
      List: forwardRef<HTMLDivElement, { style?: CSSProperties; children?: ReactNode }>(
        ({ style, children, ...props }, ref) => (
          <div
            ref={ref}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat( auto-fill, minmax(${fixedItemWidth}px, 1fr) )`,
              ...style
            }}
            {...props}
          >
            {children}
          </div>
        )
      ),
      Item: ({ children, ...props }: { children?: ReactNode }) => (
        <div
          {...props}
          style={{
            justifySelf: 'center',
            alignSelf: 'center'
          }}
        >
          {children}
        </div>
      )
    }),
    [fixedItemWidth]
  );

  return (
    <VirtuosoGrid
      style={{
        height: '100%',
        width: '100%',
        paddingBottom: '2rem',
        ...mainStyle
      }}
      data={data}
      overscan={25}
      useWindowScroll={useWindowScroll}
      components={{ ...gridComponents, ...components }}
      ref={ref}
      initialTopMostItemIndex={{ index: initialIndex }}
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
        if (restorationStateRef.current === 'RESTORING') {
          if (
            range.startIndex < targetIndexRef.current &&
            range.endIndex < targetIndexRef.current
          ) {
            return;
          }
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

const VirtualizedGrid = forwardRef(Grid) as <T extends object>(
  props: Props<T> & { ref?: React.ForwardedRef<VirtuosoGridHandle> }
) => ReturnType<typeof Grid>;

export default VirtualizedGrid;
