import { useContext, useLayoutEffect, useRef, type FC } from 'react';

import { PanelHeaderSetterContext, type PanelHeaderFragment } from './PanelHeaderContext';

export const PanelHeaderSlot: FC<PanelHeaderFragment> = ({ info, actions, menu }) => {
  const setFragment = useContext(PanelHeaderSetterContext);
  // Hold latest menu in a ref so inline `menu={() => ...}` identity churn
  // doesn't retrigger the parent state update every render.
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const hasMenuRef = useRef(menu !== undefined);
  hasMenuRef.current = menu !== undefined;

  // Update path: replace fragment without a null-flash intermediate.
  useLayoutEffect(() => {
    const stableMenu = () => menuRef.current?.() ?? [];
    setFragment?.({ info, actions, menu: hasMenuRef.current ? stableMenu : undefined });
    // info/actions identity still triggers update (callers should memoize);
    // menu is ref-stabilized to avoid lyric-tick churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFragment, info, actions]);

  // Unmount path only: clear the frame header.
  useLayoutEffect(() => {
    return () => setFragment?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFragment]);

  return null;
};

PanelHeaderSlot.displayName = 'PanelHeaderSlot';
