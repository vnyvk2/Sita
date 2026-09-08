import { useStore } from '@tanstack/react-store';
import { memo, useContext } from 'react';

import { AppUpdateContext } from '../contexts/AppUpdateContext';
import { getSelectedIdSet } from '../contexts/MultipleSelectionContext';
import { store } from '../store/store';
import Checkbox from './Checkbox';

type Props = {
  id: number;
  selectionType: QueueTypes;
  className?: string;
};

const MultipleSelectionCheckbox = memo(function MultipleSelectionCheckbox(props: Props) {
  const { id, selectionType, className = '' } = props;

  const isChecked = useStore(
    store,
    (state) =>
      state.multipleSelectionsData.selectionType === selectionType &&
      getSelectedIdSet(state.multipleSelectionsData.multipleSelections).has(id)
  );
  const isEnabled = useStore(store, (state) => state.multipleSelectionsData.isEnabled);

  const { updateMultipleSelections } = useContext(AppUpdateContext);

  return (
    <Checkbox
      id={String(id)}
      isChecked={isChecked}
      checkedStateUpdateFunction={(state) =>
        updateMultipleSelections(id, selectionType, state ? 'remove' : 'add')
      }
      className={`dark:peer-checked:[&>.checkmark]:border-font-color-highlight! dark:peer-checked:[&>.checkmark]:bg-font-color-highlight! dark:peer-checked:[&>.checkmark]:text-font-color-highlight! peer-checked:[&>.checkmark]:shadow-lg! ${
        isEnabled ? '' : 'hidden'
      } m-0! ${className}`}
    />
  );
});

MultipleSelectionCheckbox.displayName = 'MultipleSelectionCheckbox';
export default MultipleSelectionCheckbox;
