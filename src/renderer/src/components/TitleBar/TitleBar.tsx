import { useLocation } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { dndStore, workspaceActions, workspaceStore } from '@renderer/workspace/store';
import { memo } from 'react';

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

const TitleBar = memo(() => {
  const bodyBackgroundImage = useStore(store, (state) => state.bodyBackgroundImage);
  const isFullScreenPlayer = useStore(store, (state) => state.playerType === 'full');
  const isExperimentalWorkspace = useStore(
    store,
    (state) => state.localStorage.preferences?.isExperimentalWorkspaceEnabled ?? false
  );
  const isToolbarCollapsed = useStore(dndStore, (s) => s.isToolbarCollapsed);
  const activeWorkspaceId = useStore(workspaceStore, (s) => s.active);
  const workspaces = useStore(workspaceStore, (s) => s.workspaces);
  const activeWorkspace = workspaces[activeWorkspaceId];

  const location = useLocation();
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
      {window.api.properties.isInDevelopment ? (
        <CurrentLocationContainer href={location.href} className={`${isDarwin ? 'pl-4' : ''}`} />
      ) : (
        <div />
      )}
      <div className="window-controls-and-special-controls-and-indicators-container flex h-full flex-row">
        <div className="special-controls-and-indicators-container mr-2 flex items-center justify-between py-1">
          {isExperimentalWorkspace && isToolbarCollapsed && !isFullScreenPlayer && (
            <button
              type="button"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              onClick={() => workspaceActions.setToolbarCollapsed(false)}
              title={`Show Workspace Toolbar (${activeWorkspace?.name ?? 'Workspace'})`}
              className="workspace-toolbar-restore-btn app-region-no-drag hover:bg-background-color-2 hover:text-font-color-highlight dark:hover:bg-dark-background-color-2 dark:hover:text-font-color-highlight !mr-2 flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-stone-200/60 px-2 py-0.5 text-xs font-semibold shadow-2xs backdrop-blur-md transition-all hover:scale-105 dark:border-stone-700/60"
            >
              <span className="material-symbols-rounded text-accent text-base leading-none">
                view_quilt
              </span>
              <span className="max-w-[100px] truncate text-[11px]">
                {activeWorkspace?.name ?? 'Workspace'}
              </span>
              <span className="material-symbols-rounded text-font-color-dimmed text-xs opacity-70">
                expand_more
              </span>
            </button>
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
