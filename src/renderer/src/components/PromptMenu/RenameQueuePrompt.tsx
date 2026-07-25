/* eslint-disable jsx-a11y/no-autofocus */
import { useCallback, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import Button from '../Button';
import { getQueuesManager } from '../../other/queuesManager';
import { dispatch } from '../../store/store';

type Props = { 
  queueId: string; 
  currentName: string;
};

const RenameQueuePrompt = (props: Props) => {
  const { queueId, currentName } = props;
  const { changePromptMenuData } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const manager = getQueuesManager();

  const [input, setInput] = useState(currentName);

  const renameQueue = useCallback(
    (newName: string) => {
      if (manager && newName.trim()) {
        manager.renameQueue(queueId, newName.trim());
      }
      changePromptMenuData(false);
    },
    [changePromptMenuData, manager, queueId]
  );

  return (
    <div className="flex flex-col items-center justify-center">
      <span className="mb-4 text-center text-2xl font-medium">
        {t('currentQueuePage.renameQueue', 'Rename Queue')}
      </span>
      <input
        type="text"
        name="queueName"
        className="queue-name-input bg-background-color-2! text-font-color-black dark:bg-dark-background-color-2! dark:text-font-color-white w-fit max-w-[75%] min-w-100 rounded-2xl border-transparent px-6 py-3 text-lg outline-hidden"
        placeholder={t('currentQueuePage.queueName', 'Queue Name')}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') renameQueue(e.currentTarget.value);
        }}
        autoFocus
      />
      <Button
        label={t('currentQueuePage.renameQueue', 'Rename Queue')}
        iconName="edit"
        className="bg-background-color-3! text-font-color-black! dark:bg-dark-background-color-3! dark:text-font-color-black mt-6 mr-0! cursor-pointer justify-center p-2 px-8! py-3! text-lg"
        clickHandler={() => renameQueue(input)}
      />
    </div>
  );
};

export default RenameQueuePrompt;
