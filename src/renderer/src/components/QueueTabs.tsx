import { useCallback, useContext, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '@tanstack/react-store';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

import Button from './Button';
import { AppUpdateContext } from '../contexts/AppUpdateContext';
import { store } from '../store/store';
import { getQueuesManager } from '../other/queuesManager';
import RenameQueuePrompt from './PromptMenu/RenameQueuePrompt';

interface QueueTabsProps {
  viewingQueueIndex: number;
  setViewingQueueIndex: (index: number | ((prev: number) => number)) => void;
}

export default function QueueTabs({ viewingQueueIndex, setViewingQueueIndex }: QueueTabsProps) {
  const { t } = useTranslation();
  const queueState = useStore(store, (state) => state.localStorage.queue);
  const manager = getQueuesManager();
  
  const { updateContextMenuData, addNewNotifications, changePromptMenuData } = useContext(AppUpdateContext);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleSwitchQueue = useCallback((index: number) => {
    if (manager && index >= 0 && index < manager.queues.length) {
      setViewingQueueIndex(index);
    }
  }, [manager, setViewingQueueIndex]);

  const handleCreateNewQueue = useCallback(() => {
    if (manager) {
      manager.createQueue();
      setViewingQueueIndex(manager.queues.length - 1);
      addNewNotifications([{
        id: `new-queue-${Date.now()}`,
        content: t('currentQueuePage.newQueueCreated', 'New queue created'),
        iconName: 'queue_music'
      }]);
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

  const handleDeleteQueue = useCallback((queueId: string, index: number) => {
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
      addNewNotifications([{
        id: `delete-queue-${Date.now()}`,
        content: t('currentQueuePage.queueDeleted', 'Queue deleted'),
        iconName: 'delete'
      }]);
    } else {
      addNewNotifications([{
        id: `delete-queue-failed`,
        content: t('currentQueuePage.cannotDeleteLastQueue', 'Cannot delete the last queue'),
        iconName: 'error'
      }]);
    }
  }, [manager, setViewingQueueIndex, addNewNotifications, t]);

  const handleDragEnd = useCallback((result: DropResult) => {
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
  }, [manager, setViewingQueueIndex]);

  return (
    <div className="queue-tabs-container relative flex items-center w-full bg-background-color-2/50 dark:bg-dark-background-color-2/50 rounded-full p-1 shadow-inner overflow-hidden">
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="queue-tabs" direction="horizontal">
          {(provided) => (
            <div 
              ref={(el) => {
                provided.innerRef(el);
                if (el) {
                  // @ts-ignore
                  scrollContainerRef.current = el;
                }
              }}
              {...provided.droppableProps}
              className="flex-1 overflow-x-auto flex items-center scrollbar-hide no-scrollbar"
            >
              {queueState.queues.map((q, index) => {
                const isActive = index === queueState.currentQueueIndex;
                const isViewing = index === viewingQueueIndex;
                const title = q.metadata?.title || (q.metadata?.queueType === 'songs' ? 'All Songs' : `Queue ${index + 1}`);
                const queueId = q.id || `queue-fallback-${index}`;
                
                return (
                  <Draggable key={queueId} draggableId={queueId} index={index}>
                    {(provided, snapshot) => {
                      const child = (
                        <div 
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          style={{
                            ...provided.draggableProps.style,
                            ...(snapshot.isDragging ? { transition: 'none' } : {}),
                            ...(snapshot.isDropAnimating ? { transitionDuration: '0.001s' } : {})
                          }}
                          className={`mr-2 flex-shrink-0 flex items-center rounded-full px-4 py-2 cursor-pointer border outline-hidden select-none
                            ${isActive 
                              ? 'bg-background-color-3 dark:bg-dark-background-color-3 border-background-color-3 text-font-color-black dark:text-font-color-white font-medium' 
                              : 'bg-transparent border-transparent text-font-color-black/60 dark:text-font-color-white/60 hover:bg-background-color-3/40 dark:hover:bg-dark-background-color-3/40 hover:text-font-color-black dark:hover:text-font-color-white'
                            } ${isViewing && !isActive ? 'ring-1 ring-background-color-3 dark:ring-dark-background-color-3' : ''} 
                            ${snapshot.isDragging ? 'shadow-2xl ring-2 ring-background-color-3 dark:ring-dark-background-color-3 opacity-90' : 'transition-colors duration-300 ease-in-out shadow-md'}
                          `}
                        onClick={() => handleSwitchQueue(index)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          updateContextMenuData(true, [
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
                              label: t('currentQueuePage.deleteQueue', 'Delete Queue'),
                              iconName: 'delete',
                              isDisabled: queueState.queues.length <= 1,
                              handlerFunction: () => handleDeleteQueue(q.id, index)
                            }
                          ], e.pageX, e.pageY);
                        }}
                      >
                        {isActive && (
                          <span className="material-icons-round text-sm mr-2 animate-pulse text-font-color-highlight dark:text-dark-font-color-highlight" title="Currently Playing">
                            equalizer
                          </span>
                        )}
                        {!isActive && isViewing && (
                          <span className="material-icons-round text-sm mr-2 text-font-color-black/40 dark:text-font-color-white/40" title="Viewing">
                            visibility
                          </span>
                        )}
                        <span className="truncate max-w-[150px]">{title}</span>
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
      
      <div className="flex-shrink-0 border-l border-background-color-3 dark:border-dark-background-color-3 ml-2 pl-2">
        <Button
          className="rounded-full w-8 h-8 flex items-center justify-center bg-background-color-3 dark:bg-dark-background-color-3 shadow-md hover:scale-105 transition-transform !m-0"
          iconName="add"
          iconClassName="text-xl"
          tooltipLabel={t('currentQueuePage.createNewQueue', 'Create New Queue')}
          clickHandler={handleCreateNewQueue}
        />
      </div>
    </div>
  );
}
