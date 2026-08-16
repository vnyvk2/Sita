import { useDebouncedCallback } from '@tanstack/react-pacer';
import {
  type CSSProperties,
  type ReactNode,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
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
  const isInitialMountRef = useRef<boolean>(true);
  const innerVirtuosoRef = useRef<VirtuosoGridHandle | null>(null);

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

  // Imperative restoration when scrollKey changes on an already-mounted grid
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

      // Imperatively scroll VirtuosoGrid to the restored position for the new dataset key
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

  const setCombinedVirtuosoRef = (handle: VirtuosoGridHandle | null) => {
    innerVirtuosoRef.current = handle;
    if (typeof ref === 'function') {
      ref(handle);
    } else if (ref && typeof ref === 'object') {
      (ref as React.MutableRefObject<VirtuosoGridHandle | null>).current = handle;
    }
  };

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
      ref={setCombinedVirtuosoRef}
      initialTopMostItemIndex={{ index: initialIndex }}
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
