/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useStore } from '@tanstack/react-store';
import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { store } from '../../store/store';
import ContextMenuDataItem from './ContextMenuDataItem';
import ContextMenuItem from './ContextMenuItem';

const ContextMenu = memo(() => {
  const contextMenuData = useStore(store, (state) => state.contextMenuData);

  const { isVisible, menuItems, data } = contextMenuData;

  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({
    width: 0,
    height: 0,
    positionX: 0,
    positionY: 0,
    transformOrigin: 'top left'
  });

  const contextMenuStyles: CSSProperties = {};
  contextMenuStyles['--position-x'] = `${dimensions.positionX}px`;
  contextMenuStyles['--position-y'] = `${dimensions.positionY}px`;
  contextMenuStyles['--transform-origin'] = `${dimensions.transformOrigin}`;

  useLayoutEffect(() => {
    const { pageX, pageY } = contextMenuData;

    if (contextMenuRef.current) {
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const menuHeight = contextMenuRef.current.clientHeight;
      const menuWidth = contextMenuRef.current.clientWidth;

      setDimensions({
        width: menuWidth,
        height: menuHeight,
        positionX: pageX + menuWidth > viewportWidth ? pageX - menuWidth : pageX,
        positionY:
          pageY + menuHeight > viewportHeight
            ? pageY - menuHeight + (pageY - menuHeight > 40 ? 0 : Math.abs(pageY - menuHeight) + 40)
            : pageY,
        transformOrigin: `${
          pageY + menuHeight > viewportHeight ? 'bottom' : 'top'
        } ${pageX + menuWidth > viewportWidth ? 'right' : 'left'}`
      });
    }
  }, [contextMenuData]);

  const contextMenuItems = useMemo(
    () =>
      menuItems
        .filter((menuItem) => !menuItem.isDisabled)
        .map((menuItem, index) => {
          if (menuItem.isContextMenuItemSeperator)
            return (
              <div
                key={`sep-${index}`}
                role="separator"
                className="context-menu-item-seperator my-1.5 h-[1px] w-[92%] self-center bg-[hsla(0deg,0%,57%,0.3)]"
              />
            );
          return <ContextMenuItem key={`${menuItem.label}-${index}`} {...menuItem} />;
        }),
    [menuItems]
  );

  return (
    <div
      className={`context-menu invisible scale-75 opacity-0 ${
        isVisible ? 'visible! scale-100! opacity-100!' : ''
      } ${
        !data && 'pt-2'
      } bg-context-menu-background/90 text-font-color-black dark:bg-dark-context-menu-background/90 dark:text-font-color-white absolute z-50 flex h-fit w-fit min-w-[15rem] origin-top-left flex-col overflow-visible rounded-lg pt-1 pb-1 shadow-[10px_0px_53px_0px_rgba(0,0,0,0.22)] backdrop-blur-md transition-[opacity,scale,transform,visibility,width,height]!`}
      onClick={(e) => e.stopPropagation()}
      style={{
        top: dimensions.positionY,
        left: dimensions.positionX,
        transformOrigin: dimensions.transformOrigin
      }}
      ref={contextMenuRef}
      tabIndex={isVisible ? 0 : -1}
      role="menu"
    >
      {data && <ContextMenuDataItem data={data} />}
      {contextMenuItems}
    </div>
  );
});

ContextMenu.displayName = 'ContextMenu';
export default ContextMenu;
