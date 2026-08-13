import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../contexts/AppUpdateContext';
import { getQueuesManager } from '../other/queuesManager';
import { store } from '../store/store';
import Button from './Button';
import RemoveAllQueuesPrompt from './PromptMenu/RemoveAllQueuesPrompt';
import RenameQueuePrompt from './PromptMenu/RenameQueuePrompt';

interface QueueTabsProps {
  viewingQueueIndex: number;
  setViewingQueueIndex: (index: number | ((prev: number) => number)) => void;
}

export default function QueueTabs({ viewingQueueIndex, setViewingQueueIndex }: QueueTabsProps) {
  const { t } = useTranslation();
  const queueState = useStore(store, (state) => state.localStorage.queue);
  const manager = getQueuesManager();

  const { updateContextMenuData, addNewNotifications, changePromptMenuData } =
    useContext(AppUpdateContext);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const handleSwitchQueue = useCallback(
    (index: number) => {
      if (manager && index >= 0 && index < manager.queues.length) {
        setViewingQueueIndex(index);
      }
    },
    [manager, setViewingQueueIndex]
  );

  const handleCreateNewQueue = useCallback(() => {
    if (manager) {
      manager.createQueue();
      setViewingQueueIndex(manager.queues.length - 1);
      addNewNotifications([
        {
          id: `new-queue-${Date.now()}`,
          content: t('currentQueuePage.newQueueCreated', 'New queue created'),
          iconName: 'queue_music'
        }
      ]);
      // Scroll to end
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({
            left: scrollContainerRef.current.scrollWidth,
            behavior: 'smooth'
          });
        }
      }, 100);
    }
  }, [manager, setViewingQueueIndex, addNewNotifications, t]);

  const handleDeleteQueue = useCallback(
    (queueId: string, index: number) => {
      if (manager && manager.queues.length > 1) {
        manager.deleteQueue(queueId);
        setViewingQueueIndex((prev) => {
          if (prev === index) {
            return Math.max(0, index - 1);
          } else if (prev > index) {
            return prev - 1;
          }
          return prev;
        });
        addNewNotifications([
          {
            id: `delete-queue-${Date.now()}`,
            content: t('currentQueuePage.queueDeleted', 'Queue deleted'),
            iconName: 'delete'
          }
        ]);
      } else {
        addNewNotifications([
          {
            id: `delete-queue-failed`,
            content: t('currentQueuePage.cannotDeleteLastQueue', 'Cannot delete the last queue'),
            iconName: 'error'
          }
        ]);
      }
    },
    [manager, setViewingQueueIndex, addNewNotifications, t]
  );

  const handleRemoveAllQueues = useCallback(() => {
    if (manager) {
      const unlockedCount = manager.queues.filter((q) => !q.getMetadata().isLocked).length;
      if (unlockedCount === 0) {
        addNewNotifications([
          {
            id: `remove-all-queues-empty`,
            content: t('currentQueuePage.noUnlockedQueues', 'No unlocked queues to remove.'),
            iconName: 'info'
          }
        ]);
        return;
      }
      changePromptMenuData(true, <RemoveAllQueuesPrompt />, 'remove-all-queues-prompt');
    }
  }, [manager, changePromptMenuData, addNewNotifications, t]);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination || !manager) return;

      const sourceIndex = result.source.index;
      const destinationIndex = result.destination.index;

      if (sourceIndex === destinationIndex) return;

      manager.reorderQueues(sourceIndex, destinationIndex);

      setViewingQueueIndex((prev) => {
        if (prev === sourceIndex) {
          return destinationIndex;
        } else if (sourceIndex < prev && destinationIndex >= prev) {
          return prev - 1;
        } else if (sourceIndex > prev && destinationIndex <= prev) {
          return prev + 1;
        }
        return prev;
      });
    },
    [manager, setViewingQueueIndex]
  );

  return (
    <div className="queue-tabs-container bg-background-color-2/50 dark:bg-dark-background-color-2/50 relative flex w-full items-center overflow-hidden rounded-full p-1 shadow-inner">
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="queue-tabs" direction="horizontal">
          {(provided) => (
            <div
              role="tablist"
              aria-label={t('currentQueuePage.queueTabs', 'Queue Tabs')}
              ref={(el) => {
                provided.innerRef(el);
                scrollContainerRef.current = el;
              }}
              {...provided.droppableProps}
              className="scrollbar-hide no-scrollbar flex flex-1 items-center overflow-x-auto"
            >
              {queueState.queues.map((q, index) => {
                const isActive = index === queueState.currentQueueIndex;
                const isViewing = index === viewingQueueIndex;
                const title =
                  q.metadata?.title ||
                  (q.metadata?.queueType === 'songs' ? 'All Songs' : `Queue ${index + 1}`);
                const queueId = q.id || `queue-fallback-${index}`;

                return (
                  <Draggable key={queueId} draggableId={queueId} index={index}>
                    {(provided, snapshot) => {
                      const child = (
                        <div
                          role="tab"
                          aria-selected={isViewing}
                          tabIndex={isViewing ? 0 : -1}
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          style={{
                            ...provided.draggableProps.style,
                            ...(snapshot.isDragging ? { transition: 'none' } : {}),
                            ...(snapshot.isDropAnimating ? { transitionDuration: '0.001s' } : {})
                          }}
                          className={`mr-2 flex flex-shrink-0 cursor-pointer items-center rounded-full border px-4 py-2 outline-hidden select-none ${
                            isActive
                              ? 'bg-background-color-3 dark:bg-dark-background-color-3 border-background-color-3 text-font-color-black dark:text-font-color-white font-medium'
                              : 'text-font-color-black/60 dark:text-font-color-white/60 hover:bg-background-color-3/40 dark:hover:bg-dark-background-color-3/40 hover:text-font-color-black dark:hover:text-font-color-white border-transparent bg-transparent'
                          } ${isViewing && !isActive ? 'ring-background-color-3 dark:ring-dark-background-color-3 ring-1' : ''} ${snapshot.isDragging ? 'ring-background-color-3 dark:ring-dark-background-color-3 opacity-90 shadow-2xl ring-2' : 'shadow-md transition-colors duration-300 ease-in-out'} `}
                          onClick={() => handleSwitchQueue(index)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSwitchQueue(index);
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            updateContextMenuData(
                              true,
                              [
                                {
                                  label: t('currentQueuePage.renameQueue', 'Rename Queue'),
                                  iconName: 'edit',
                                  handlerFunction: () => {
                                    changePromptMenuData(
                                      true,
                                      <RenameQueuePrompt queueId={q.id} currentName={title} />,
                                      'rename-queue-prompt'
                                    );
                                  }
                                },
                                {
                                  label: q.metadata?.isLocked
                                    ? t('currentQueuePage.unlockQueue', 'Unlock Queue')
                                    : t('currentQueuePage.lockQueue', 'Lock Queue'),
                                  iconName: q.metadata?.isLocked ? 'lock_open' : 'lock',
                                  handlerFunction: () => {
                                    if (manager) {
                                      manager.toggleQueueLock(q.id);
                                    }
                                  }
                                },
                                {
                                  label: t('currentQueuePage.deleteQueue', 'Delete Queue'),
                                  iconName: 'delete',
                                  isDisabled:
                                    queueState.queues.length <= 1 || !!q.metadata?.isLocked,
                                  handlerFunction: () => handleDeleteQueue(q.id, index)
                                }
                              ],
                              e.pageX,
                              e.pageY
                            );
                          }}
                        >
                          {isActive && (
                            <span
                              className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight mr-2 animate-pulse text-sm"
                              title="Currently Playing"
                            >
                              equalizer
                            </span>
                          )}
                          {!isActive && isViewing && (
                            <span
                              className="material-icons-round text-font-color-black/40 dark:text-font-color-white/40 mr-2 text-sm"
                              title="Viewing"
                            >
                              visibility
                            </span>
                          )}
                          {q.metadata?.isLocked && (
                            <span
                              className="material-icons-round text-font-color-black/60 dark:text-font-color-white/60 mr-2 text-sm"
                              title={t('currentQueuePage.lockedQueue', 'Locked Queue')}
                            >
                              lock
                            </span>
                          )}
                          <span className="max-w-[150px] truncate">{title}</span>
                        </div>
                      );

                      if (snapshot.isDragging) {
                        return createPortal(child, document.body);
                      }

                      return child;
                    }}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <div className="border-background-color-3 dark:border-dark-background-color-3 ml-2 flex flex-shrink-0 gap-2 border-l pl-2">
        <Button
          className="bg-background-color-3 dark:bg-dark-background-color-3 !m-0 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-transform hover:scale-105"
          iconName="add"
          iconClassName="text-xl"
          tooltipLabel={t('currentQueuePage.createNewQueue', 'Create New Queue')}
          clickHandler={handleCreateNewQueue}
        />
        <Button
          className="bg-background-color-3 dark:bg-dark-background-color-3 !m-0 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-transform hover:scale-105 hover:!bg-font-color-crimson hover:!text-font-color-white"
          iconName="delete_sweep"
          iconClassName="text-xl"
          tooltipLabel={t('currentQueuePage.removeAllQueues', 'Remove All Queues')}
          clickHandler={handleRemoveAllQueues}
        />
      </div>
    </div>
  );
}
