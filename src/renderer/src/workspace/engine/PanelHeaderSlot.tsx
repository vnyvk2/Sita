import { useContext, useEffect, type FC } from 'react';

import { PanelHeaderSetterContext, type PanelHeaderFragment } from './PanelHeaderContext';

export const PanelHeaderSlot: FC<PanelHeaderFragment> = ({ info, actions, menu }) => {
  const setFragment = useContext(PanelHeaderSetterContext);

  useEffect(() => {
    setFragment?.({ info, actions, menu });
    return () => setFragment?.(null);
  }, [setFragment, info, actions, menu]);

  return null;
};

PanelHeaderSlot.displayName = 'PanelHeaderSlot';
