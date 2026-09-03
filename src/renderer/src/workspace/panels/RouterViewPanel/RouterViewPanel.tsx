import { Outlet } from '@tanstack/react-router';
import { memo, type FC } from 'react';

import type { PanelProps } from '../../registry';

export const RouterViewPanel: FC<PanelProps> = memo(() => {
  return (
    <div className="router-view-panel relative h-full w-full min-w-0 flex-1 overflow-hidden *:overflow-x-hidden">
      <Outlet />
    </div>
  );
});

RouterViewPanel.displayName = 'RouterViewPanel';
export default RouterViewPanel;
