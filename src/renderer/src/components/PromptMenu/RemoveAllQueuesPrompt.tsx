import { useCallback, useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { getQueuesManager } from '../../other/queuesManager';
import Button from '../Button';

const RemoveAllQueuesPrompt = () => {
  const { changePromptMenuData, addNewNotifications } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const manager = getQueuesManager();

  const totalQueues = manager?.queues.length || 0;
  const activeQueueIndex = manager?.activeQueueIndex ?? 0;
  const keptQueues =
    manager?.queues.filter((q, idx) => q.getMetadata().isLocked || idx === activeQueueIndex)
      .length || 0;
  const unlockedQueues = totalQueues - keptQueues;

  const removeQueues = useCallback(() => {
    if (manager) {
      const { deleted, kept } = manager.removeAllQueues();
      addNewNotifications([
        {
          id: `removed-all-queues`,
          content: t('currentQueuePage.removedAllQueues', {
            deleted,
            kept,
            defaultValue: `Removed ${deleted} queues. Kept ${kept} active & locked queues.`
          }),
          iconName: 'delete'
        }
      ]);
    }
    changePromptMenuData(false);
  }, [changePromptMenuData, manager, addNewNotifications, t]);

  const cancel = useCallback(() => {
    changePromptMenuData(false);
  }, [changePromptMenuData]);

  return (
    <div className="flex flex-col items-center justify-center">
      <span className="mb-4 text-center text-2xl font-medium">
        {t('currentQueuePage.removeAllQueues', 'Remove All Queues')}
      </span>
      <div className="text-font-color-black/80 dark:text-font-color-white/80 mb-6 text-center text-lg">
        <p>
          {t('currentQueuePage.unlockedQueuesRemoved', {
            count: unlockedQueues,
            defaultValue: `${unlockedQueues} unlocked background queues will be removed.`
          })}
        </p>
        <p>
          {t('currentQueuePage.lockedQueuesKept', {
            count: keptQueues,
            defaultValue: `${keptQueues} queues will be kept (active & locked).`
          })}
        </p>
      </div>
      <div className="flex gap-4">
        <Button
          label={t('common.cancel', 'Cancel')}
          className="bg-background-color-2! text-font-color-black! dark:bg-dark-background-color-2! dark:text-font-color-white! mt-2 cursor-pointer justify-center p-2 px-8! py-3! text-lg hover:underline"
          clickHandler={cancel}
        />
        <Button
          label={t('common.remove', 'Remove')}
          iconName="delete"
          className="bg-font-color-crimson! text-font-color-white! dark:bg-font-color-crimson! dark:text-font-color-white! mt-2 cursor-pointer justify-center p-2 px-8! py-3! text-lg"
          clickHandler={removeQueues}
        />
      </div>
    </div>
  );
};

export default RemoveAllQueuesPrompt;
