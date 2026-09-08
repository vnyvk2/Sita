import { useLocation } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { lazy, memo, Suspense } from 'react';

import LightModeLogo from '../../assets/images/webp/logo_light_mode.webp';
import { store } from '../../store/store';
import Img from '../Img';
import CurrentLocationContainer from './CurrentLocationContainer';
import NetworkIndicator from './indicators/NetworkIndicator';
import NewUpdateIndicator from './indicators/NewUpdateIndicator';
import NavigationControlsContainer from './NavigationControlsContainer';
import ChangeThemeBtn from './special_controls/ChangeThemeBtn';
import GoToMainPlayerBtn from './special_controls/GoToMainPlayerBtn';
import WindowControlsContainer from './WindowControlsContainer';

const LazyWorkspaceToolbarRestoreBtn = lazy(() => import('./WorkspaceToolbarRestoreBtn'));

const TitleBar = memo(() => {
  const bodyBackgroundImage = useStore(store, (state) => state.bodyBackgroundImage);
  const isFullScreenPlayer = useStore(store, (state) => state.playerType === 'full');
  const isExperimentalWorkspace = useStore(
    store,
    (state) => state.localStorage.preferences?.isExperimentalWorkspaceEnabled ?? false
  );

  const devLocationHref = useLocation({
    select: (loc) => (window.api.properties.isInDevelopment ? loc.href : undefined)
  });
  const isDarwin = window.api.properties.platform === 'darwin';

  return (
    <header
      id="title-bar"
      className={`text-font-color-black dark:text-font-color-white relative top-0 z-40 grid h-10 w-full items-center justify-between overflow-hidden bg-transparent transition-opacity ${
        bodyBackgroundImage &&
        'bg-background-color-1/50 text-font-color-white! dark:bg-dark-background-color-1/70 backdrop-blur-md'
      } ${isDarwin ? 'grid-cols-[clamp(10rem,30%,17rem)_1fr_auto] pl-24' : 'grid-cols-[clamp(10rem,30%,18rem)_1fr_auto]'}`}
    >
      <div
        className={`logo-and-app-name-and-navigation-controls-container flex h-full w-full items-center justify-between`}
      >
        <div className="logo-and-app-name-container flex items-center">
          <span className="logo-container">
            <Img
              className={`mr-2 aspect-square h-7 w-7 rounded-md p-1 shadow-md`}
              src={LightModeLogo}
              alt="Nora Logo"
            />
          </span>
          <span className="app-name-container" title="Nora">
            <span className="font-medium tracking-wide">Sita</span>
          </span>
        </div>
        {!isFullScreenPlayer ? <NavigationControlsContainer /> : <div />}
      </div>
      {window.api.properties.isInDevelopment && devLocationHref ? (
        <CurrentLocationContainer href={devLocationHref} className={`${isDarwin ? 'pl-4' : ''}`} />
      ) : (
        <div />
      )}
      <div className="window-controls-and-special-controls-and-indicators-container flex h-full flex-row">
        <div className="special-controls-and-indicators-container mr-2 flex items-center justify-between py-1">
          {isExperimentalWorkspace && !isFullScreenPlayer && (
            <Suspense fallback={null}>
              <LazyWorkspaceToolbarRestoreBtn />
            </Suspense>
          )}
          <div className="indicators-container flex flex-row">
            {/* <ThrottlingIndicator /> */}
            <NewUpdateIndicator />
            <NetworkIndicator />
          </div>
          <div className="special-controls-container flex flex-row">
            {window.api.properties.isInDevelopment && <ChangeThemeBtn />}
            {isFullScreenPlayer && <GoToMainPlayerBtn />}
          </div>
        </div>
        {!isDarwin && <WindowControlsContainer />}
      </div>
    </header>
  );
});

TitleBar.displayName = 'TitleBar';
export default TitleBar;
