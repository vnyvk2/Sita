import { Outlet } from '@tanstack/react-router';

import ErrorBoundary from './ErrorBoundary';
import LyricsDrawer from './LyricsPage/LyricsDrawer';
import NotificationPanel from './NotificationPanel/NotificationPanel';
import Sidebar from './Sidebar/Sidebar';

const BodyAndSideBarContainer = () => {
  return (
    <div className="body-and-side-bar-container relative flex h-full w-full overflow-hidden">
      <ErrorBoundary>
        <NotificationPanel />
        <Sidebar />
        <div className="body relative order-2 flex-1 min-w-0 h-full! overflow-hidden rounded-tl-lg *:overflow-x-hidden lg:pl-14">
          <Outlet />
        </div>
        <LyricsDrawer />
      </ErrorBoundary>
    </div>
  );
};

export default BodyAndSideBarContainer;
