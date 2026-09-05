import { useCanGoBack, useRouter } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { dndStore, workspaceActions } from '@renderer/workspace/store';
import { useTranslation } from 'react-i18next';

import { store } from '../../store/store';
import Button from '../Button';

type Props = { disableHomeButton?: boolean; className?: string };

const NavigationControlsContainer = (props: Props) => {
  const { history, navigate } = useRouter();
  const canGoBack = useCanGoBack();

  const bodyBackgroundImage = useStore(store, (state) => state.bodyBackgroundImage);

  const { t } = useTranslation();

  const { disableHomeButton = false, className = '' } = props;

  const isExperimentalWorkspace = useStore(
    store,
    (state) => state.localStorage.preferences?.isExperimentalWorkspaceEnabled ?? false
  );
  const sidebarMode = useStore(dndStore, (s) => s.sidebarMode);

  return (
    <div
      className={`navigation-controls-container flex w-fit items-center justify-between gap-2 ${className}`}
    >
      {isExperimentalWorkspace && (
        <Button
          iconName={
            sidebarMode === 'hidden'
              ? 'dock_to_left'
              : sidebarMode === 'compact'
              ? 'left_panel_open'
              : 'dock_to_left'
          }
          iconClassName="material-symbols-rounded text-xl!"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className={`toggleSidebarBtn app-region-no-drag hover:bg-background-color-2 hover:text-font-color-highlight dark:hover:bg-dark-background-color-2 dark:hover:text-dark-font-color-highlight flex h-fit cursor-pointer rounded-md! border-0! bg-transparent px-2! py-1! outline-offset-1 transition-all! dark:bg-transparent ${
            sidebarMode === 'hidden'
              ? 'text-font-color-dimmed opacity-60'
              : 'text-accent font-semibold'
          } ${bodyBackgroundImage && 'text-font-color-white! hover:text-font-color-highlight!'}`}
          clickHandler={() => workspaceActions.cycleSidebarMode()}
          tooltipLabel={
            sidebarMode === 'expanded'
              ? 'Collapse sidebar to icons'
              : sidebarMode === 'compact'
              ? 'Hide sidebar'
              : 'Expand sidebar'
          }
        />
      )}

      <Button
        iconName="arrow_back"
        iconClassName="material-icons-round-outlined text-xl!"
        className={`previousPageBtn app-region-no-drag hover:bg-background-color-2 hover:text-font-color-highlight dark:hover:bg-dark-background-color-2 dark:hover:text-dark-font-color-highlight invisible mr-0! flex h-fit -translate-x-8 rounded-md! border-0! bg-transparent px-2! py-1! opacity-0 outline-offset-1 transition-all! dark:bg-transparent ${
          canGoBack ? 'visible! translate-x-0! opacity-100! focus-visible:outline!' : ''
        } ${bodyBackgroundImage && 'text-font-color-white! hover:text-font-color-highlight!'}`}
        clickHandler={() => history.back()}
        tooltipLabel={t('titleBar.goBack')}
      />

      {!disableHomeButton && (
        <Button
          iconName="home"
          iconClassName="material-icons-round-outlined text-xl!"
          className={`goToHomePageBtn app-region-no-drag hover:bg-background-color-2 hover:text-font-color-highlight dark:hover:bg-dark-background-color-2 dark:hover:text-dark-font-color-highlight invisible mr-0! flex h-fit scale-50 rounded-md! border-0! bg-transparent px-2! py-1! opacity-0 outline-offset-1 transition-all! dark:bg-transparent ${
            canGoBack ? 'visible! scale-100! opacity-100! focus-visible:outline!' : ''
          } `}
          clickHandler={() => navigate({ to: '/main-player/home' })}
          tooltipLabel={t('titleBar.goHome')}
        />
      )}
      {/* TODO: Implement forward navigation */}
      {/* <Button
        iconName="arrow_forward"
        iconClassName="material-icons-round-outlined text-xl!"
        className={`forwardPageBtn app-region-no-drag hover:bg-background-color-2 hover:text-font-color-highlight dark:hover:bg-dark-background-color-2 dark:hover:text-dark-font-color-highlight invisible mr-0! flex h-fit translate-x-8 rounded-md! border-0! bg-transparent px-2! py-1! opacity-0 outline-offset-1 transition-all! dark:bg-transparent ${
          noOfPagesInHistory !== 0 && pageHistoryIndex < noOfPagesInHistory
            ? 'visible! translate-x-0! opacity-100! focus-visible:outline!'
            : ''
        } ${bodyBackgroundImage && 'text-font-color-white! hover:text-font-color-highlight!'}`}
        clickHandler={() => {}}
        tooltipLabel={t('titleBar.goForward')}
      /> */}
    </div>
  );
};

export default NavigationControlsContainer;
