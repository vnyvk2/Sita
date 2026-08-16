import { useNavigate } from '@tanstack/react-router';
import { lazy, useCallback, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import FolderImg from '../../assets/images/webp/empty-folder.webp';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import type { FolderMetrics } from '../../utils/folderMetrics';
import Button from '../Button';
import Img from '../Img';

const RemoveFolderConfirmationPrompt = lazy(() => import('./RemoveFolderConfirmationPrompt'));
const BlacklistFolderConfrimPrompt = lazy(() => import('./BlacklistFolderConfirmPrompt'));

type FolderProps = {
  folderPath: string;
  songIds: number[];
  subFolders?: MusicFolder[];
  hasChildren?: boolean;
  metrics?: FolderMetrics;
  isBlacklisted: boolean;
  className?: string;
  index: number;
  depth?: number;
  isExpanded?: boolean;
  onToggleExpand?: (folderPath: string) => void;
  selectAllHandler: (upToId?: number) => void;
};

const Folder = (props: FolderProps) => {
  const { updateContextMenuData, changePromptMenuData } = useContext(AppUpdateContext);

  const {
    folderPath,
    songIds,
    index,
    isBlacklisted = true,
    className = '',
    subFolders,
    hasChildren,
    metrics,
    depth = 0,
    isExpanded = false,
    onToggleExpand
  } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();

  const directSongCount = metrics?.directSongCount ?? songIds.length;
  const totalSongCount = metrics?.totalSongCount ?? directSongCount;
  const directFolderCount = metrics?.directFolderCount ?? subFolders?.length ?? 0;
  const isFolderParent = hasChildren ?? directFolderCount > 0;

  const { folderName, prevDir } = useMemo(() => {
    if (folderPath) {
      const path = folderPath.split('\\');
      const name = path.pop() || folderPath;

      return { prevDir: path.join('\\'), folderName: name };
    }
    return { prevDir: undefined, folderName: undefined };
  }, [folderPath]);

  const isAMultipleSelection = useMemo(() => {
    // Folders don't support numeric-based multiple selections (no numeric IDs)
    return false;
  }, []);

  const openMusicFolderInfoPage = useCallback(() => {
    if (folderPath) {
      navigate({ to: '/main-player/folders/$folderPath', params: { folderPath } });
    }
  }, [folderPath, navigate]);

  const contextMenuItems = useMemo((): ContextMenuItem[] => {
    return [
      {
        label: t('common.select'),
        iconName: 'checklist',
        isDisabled: true, // Folders don't support numeric-based multiple selections
        handlerFunction: () => {
          // Selection not supported for folders (no numeric IDs)
        }
      },
      {
        label: t('common.info'),
        iconName: 'info',
        handlerFunction: openMusicFolderInfoPage,
        isDisabled: false
      },
      {
        label: t('song.showInFileExplorer'),
        class: 'reveal-file-explorer',
        iconName: 'folder_open',
        handlerFunction: () => window.api.folderData.revealFolderInFileExplorer(folderPath)
      },
      {
        label: 'Hr',
        isContextMenuItemSeperator: true,
        handlerFunction: null
      },
      {
        label: t(isBlacklisted ? 'song.deblacklist' : 'folder.blacklistFolder'),
        iconName: isBlacklisted ? 'settings_backup_restore' : 'block',
        handlerFunction: () => {
          if (isBlacklisted)
            window.api.folderData
              .restoreBlacklistedFolders([folderPath])
              .catch((err) => console.error(err));
          else
            changePromptMenuData(
              true,
              <BlacklistFolderConfrimPrompt folderName={folderName} folderPaths={[folderPath]} />
            );
        }
      },
      {
        label: 'Remove Folder',
        iconName: 'delete',
        iconClassName: 'material-icons-round-outlined',
        handlerFunction: () =>
          changePromptMenuData(
            true,
            <RemoveFolderConfirmationPrompt
              folderName={folderName || folderPath}
              absolutePath={folderPath}
            />,
            'delete-folder-confirmation-prompt'
          ),
        isDisabled: false
      }
    ];
  }, [changePromptMenuData, folderName, folderPath, isBlacklisted, openMusicFolderInfoPage, t]);

  const contextMenuItemData = useMemo(
    (): ContextMenuAdditionalData => ({
      title: folderName || 'Unknown Folder',
      artworkPath: FolderImg,
      artworkClassName: 'w-6!',
      subTitle: t('common.songWithCount', { count: totalSongCount }),
      subTitle2:
        directFolderCount > 0
          ? t('common.subFolderWithCount', { count: directFolderCount })
          : undefined
    }),
    [directFolderCount, folderName, t, totalSongCount]
  );

  return (
    <div
      className={`mb-2 flex w-full flex-col justify-between ${className}`}
      style={
        depth > 0
          ? {
              paddingLeft: `${depth * 24}px`
            }
          : undefined
      }
    >
      <div
        role="button"
        className={`group dark:text-font-color-white flex h-13 w-full cursor-pointer items-center justify-between rounded-md px-4 py-2 -outline-offset-2 transition-colors focus-visible:!outline ${
          isAMultipleSelection
            ? 'bg-background-color-3/90! text-font-color-black! dark:bg-dark-background-color-3/90! dark:text-font-color-black!'
            : 'hover:bg-background-color-2! dark:hover:bg-dark-background-color-2!'
        } ${isBlacklisted ? 'opacity-50!' : ''} ${
          (index + 1) % 2 === 1
            ? 'bg-background-color-2/50 dark:bg-dark-background-color-2/40'
            : 'bg-background-color-1! dark:bg-dark-background-color-1!'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          openMusicFolderInfoPage();
        }}
        onKeyDown={(e) => e.key === 'Enter' && openMusicFolderInfoPage()}
        tabIndex={0}
        title={
          isBlacklisted ? t('notifications.songBlacklisted', { title: folderName }) : undefined
        }
        onContextMenu={(e) =>
          updateContextMenuData(true, contextMenuItems, e.pageX, e.pageY, contextMenuItemData)
        }
      >
        <div className="folder-img-and-info-container flex items-center">
          <div className="bg-background-color-1 text-font-color-highlight group-even:bg-background-color-2/75 group-hover:bg-background-color-1 dark:bg-dark-background-color-1 dark:text-dark-background-color-3 dark:group-even:bg-dark-background-color-2/50 dark:group-hover:bg-dark-background-color-1 relative mr-4 ml-1 h-fit rounded-2xl px-3">
            {index + 1}
          </div>
          <Img src={FolderImg} loading="eager" className="w-8 self-center" />
          <div className="folder-info ml-6 flex flex-col">
            <span className="folder-name" title={`${prevDir}\\${folderName}`}>
              {folderName}
            </span>
            <div className="flex items-center opacity-75">
              {directFolderCount > 0 && (
                <>
                  <span className="no-of-sub-folders text-xs font-thin">
                    {t('common.subFolderWithCount', {
                      count: directFolderCount
                    })}
                  </span>
                  <span className="mx-1">&bull;</span>
                </>
              )}
              {directFolderCount > 0 &&
              directSongCount > 0 &&
              directSongCount !== totalSongCount ? (
                <>
                  <span className="no-of-direct-songs text-xs font-thin">
                    {directSongCount} direct
                  </span>
                  <span className="mx-1">&bull;</span>
                  <span className="no-of-songs text-font-color-highlight dark:text-dark-font-color-highlight text-xs font-medium">
                    {t('common.songWithCount', { count: totalSongCount })} total
                  </span>
                </>
              ) : (
                <span
                  className={`no-of-songs text-xs ${
                    directFolderCount > 0
                      ? 'text-font-color-highlight dark:text-dark-font-color-highlight font-medium'
                      : 'font-thin'
                  }`}
                >
                  {t('common.songWithCount', { count: totalSongCount })}
                </span>
              )}
              <span className="invisible text-xs font-thin opacity-0 transition-[visibility,opacity] group-hover:visible group-hover:opacity-100">
                <span className="mx-1">&bull;</span>
                <span className="folder-path">{prevDir}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="folder-states-container flex">
          {isBlacklisted && (
            <span
              className="material-icons-round-outlined text-2xl"
              title="This folder is blacklisted."
            >
              block
            </span>
          )}
          {isFolderParent && (
            <Button
              className="group-hover:bg-background-color-1 dark:group-hover:bg-dark-background-color-1 ml-4 rounded-full! border-none! p-1!"
              iconClassName="text-2xl! leading-none!"
              iconName={isExpanded ? 'arrow_drop_up' : 'arrow_drop_down'}
              clickHandler={(e) => {
                e.stopPropagation();
                onToggleExpand?.(folderPath);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Folder;
