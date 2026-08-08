/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */

import { useContext, useState } from 'react';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';

const ContextMenuItem = (props: ContextMenuItem) => {
  const { updateContextMenuData } = useContext(AppUpdateContext);
  const [isExpanded, setIsExpanded] = useState(false);

  const hasInnerMenus = props.innerContextMenus && props.innerContextMenus.length > 0;

  return (
    <div className="flex flex-col">
      <div
        className={`menu-item ${
          props.class || ''
        } text-font-color-black hover:bg-context-menu-list-hover/75 dark:text-font-color-white dark:hover:bg-dark-context-menu-list-hover/25 flex cursor-pointer flex-row items-center justify-between px-4 py-1 text-sm font-light`}
        onClick={(e) => {
          e.stopPropagation();
          if (hasInnerMenus) {
            setIsExpanded(!isExpanded);
          } else if (!props.isContextMenuItemSeperator && props.handlerFunction) {
            props.handlerFunction();
            updateContextMenuData(false, []);
          }
        }}
      >
        <div className="flex min-w-0 flex-1 items-center">
          {props.iconName && (
            <span
              className={`material-icons-round icon mr-3 text-lg shrink-0 ${props.iconClassName || ''}`}
            >
              {props.iconName}
            </span>
          )}
          <span className="flex-1 leading-snug break-words">{props.label}</span>
        </div>
        {hasInnerMenus && (
          <span className="material-icons-round ml-2 text-lg shrink-0 opacity-50">
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
        )}
      </div>

      {hasInnerMenus && (
        <div
          className={`flex flex-col overflow-hidden transition-all duration-200 ${
            isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="border-font-color-black/10 dark:border-font-color-white/10 my-1 ml-4 border-l-2 py-1 pl-6">
            {props.innerContextMenus?.map((innerItem, index) => (
              <ContextMenuItem key={`${innerItem.label}-${index}`} {...innerItem} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

ContextMenuItem.displayName = 'ContextMenuItem';
export default ContextMenuItem;
