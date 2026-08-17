/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';

const ContextMenuItem = (props: ContextMenuItem) => {
  const { updateContextMenuData } = useContext(AppUpdateContext);
  const [isOpen, setIsOpen] = useState(false);
  const [flyoutStyle, setFlyoutStyle] = useState<{
    top: number;
    left?: number;
    right?: number;
  }>({ top: 0, left: 0 });

  const itemRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasInnerMenus =
    Array.isArray(props.innerContextMenus) && props.innerContextMenus.length > 0;

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && submenuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    window.addEventListener('scroll', handleScroll, {
      capture: true,
      passive: true
    });

    return () => {
      window.removeEventListener('scroll', handleScroll, {
        capture: true
      });
    };
  }, [isOpen]);

  // Render separator without any label or click behavior
  if (props.isContextMenuItemSeperator) {
    return (
      <div
        role="separator"
        className="context-menu-item-seperator my-1.5 h-[1px] w-[92%] self-center bg-[hsla(0deg,0%,57%,0.3)]"
      />
    );
  }

  const calculatePlacement = () => {
    if (!itemRef.current) return;

    const rootElement = itemRef.current.closest('#context-menu-root') as HTMLElement | null;
    const itemRect = itemRef.current.getBoundingClientRect();
    const rootRect = rootElement ? rootElement.getBoundingClientRect() : itemRect;

    const estimatedSubmenuWidth = 352;
    const estimatedSubmenuHeight = 352;

    const isRight = itemRect.right + estimatedSubmenuWidth <= window.innerWidth;
    const isTop = itemRect.top + estimatedSubmenuHeight <= window.innerHeight;

    let topOffset = itemRect.top - rootRect.top;
    if (!isTop) {
      const overflowBottom = itemRect.top + estimatedSubmenuHeight - window.innerHeight;
      topOffset = Math.max(0, topOffset - overflowBottom - 10);
    }

    if (rootElement) {
      if (isRight) {
        setFlyoutStyle({
          top: topOffset,
          left: rootRect.width
        });
      } else {
        setFlyoutStyle({
          top: topOffset,
          right: rootRect.width
        });
      }
    } else {
      // Fallback for standalone rendering without root
      setFlyoutStyle({
        top: 0,
        [isRight ? 'left' : 'right']: 0
      });
    }
  };

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (hasInnerMenus) {
      calculatePlacement();
      setIsOpen(true);
    }
  };

  const handleMouseLeave = () => {
    if (hasInnerMenus) {
      closeTimeoutRef.current = setTimeout(() => {
        setIsOpen(false);
      }, 150);
    }
  };

  const rootContainer = itemRef.current?.closest('#context-menu-root');

  const submenuContent = hasInnerMenus && isOpen && (
    <div
      ref={submenuRef}
      data-testid="flyout-submenu"
      className="bg-context-menu-background/95 text-font-color-black dark:bg-dark-context-menu-background/95 dark:text-font-color-white border-font-color-black/10 dark:border-font-color-white/10 absolute z-50 flex max-h-[22rem] max-w-[22rem] min-w-[15rem] flex-col overflow-x-hidden overflow-y-auto rounded-lg border p-1 shadow-[10px_0px_53px_0px_rgba(0,0,0,0.28)] backdrop-blur-md"
      style={{
        top: `${flyoutStyle.top}px`,
        left: flyoutStyle.left !== undefined ? `${flyoutStyle.left}px` : undefined,
        right: flyoutStyle.right !== undefined ? `${flyoutStyle.right}px` : undefined
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      {props.innerContextMenus?.map((innerItem, index) => (
        <ContextMenuItem key={`${innerItem.label}-${index}`} {...innerItem} />
      ))}
    </div>
  );

  return (
    <div
      ref={itemRef}
      className="relative flex flex-col"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`menu-item ${
          props.class || ''
        } text-font-color-black hover:bg-context-menu-list-hover/75 dark:text-font-color-white dark:hover:bg-dark-context-menu-list-hover/25 flex cursor-pointer flex-row items-center justify-between rounded-md px-4 py-1 text-sm font-light select-none`}
        onClick={(e) => {
          e.stopPropagation();
          if (hasInnerMenus) {
            calculatePlacement();
            setIsOpen((prev) => !prev);
          } else if (props.handlerFunction) {
            props.handlerFunction();
            updateContextMenuData(false, []);
          }
        }}
      >
        <div className="flex min-w-0 flex-1 items-center">
          {props.iconName && (
            <span
              className={`material-icons-round icon mr-3 shrink-0 text-lg ${props.iconClassName || ''}`}
            >
              {props.iconName}
            </span>
          )}
          <span className="flex-1 truncate leading-snug">{props.label}</span>
        </div>
        {hasInnerMenus && (
          <span className="material-icons-round ml-2 shrink-0 text-base opacity-60">
            chevron_right
          </span>
        )}
      </div>

      {rootContainer && submenuContent
        ? createPortal(submenuContent, rootContainer)
        : submenuContent}
    </div>
  );
};

ContextMenuItem.displayName = 'ContextMenuItem';
export default ContextMenuItem;
