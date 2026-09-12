import type {
  RuleCondition,
  SmartPlaylistField,
  SmartPlaylistOperator
} from '@common/collections/smartPlaylist';
import { SMART_PLAYLIST_FIELDS } from '@common/collections/smartPlaylist';
import { memo } from 'react';

const OPERATOR_LABELS: Record<SmartPlaylistOperator, string> = {
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  eq: 'is',
  neq: 'is not',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  is_true: 'is yes / true',
  is_false: 'is no / false',
  is_null: 'is unset / empty',
  is_not_null: 'is set / not empty',
  in_last: 'in the last',
  not_in_last: 'not in the last'
};

interface RuleRowProps {
  condition: RuleCondition;
  onChange: (updated: RuleCondition) => void;
  onDelete: () => void;
  canDelete: boolean;
}

export const RuleRow = memo(({ condition, onChange, onDelete, canDelete }: RuleRowProps) => {
  const currentMeta = SMART_PLAYLIST_FIELDS[condition.field] ?? SMART_PLAYLIST_FIELDS.title;

  const handleFieldChange = (newField: SmartPlaylistField) => {
    const newMeta = SMART_PLAYLIST_FIELDS[newField];
    const defaultOperator = newMeta.allowedOperators[0] || 'eq';
    let defaultValue: string | number | boolean | undefined;

    const unaryOperators: SmartPlaylistOperator[] = [
      'is_true',
      'is_false',
      'is_null',
      'is_not_null'
    ];

    if (unaryOperators.includes(defaultOperator) || newMeta.type === 'boolean') {
      defaultValue = undefined;
    } else if (newMeta.type === 'number') {
      defaultValue = newField === 'year' ? 2020 : newField === 'bitRate' ? 320 : 0;
    } else if (newMeta.type === 'date') {
      defaultValue = 30;
    } else if (newMeta.type === 'string') {
      defaultValue = '';
    }

    onChange({
      type: 'condition',
      field: newField,
      operator: defaultOperator,
      value: defaultValue
    });
  };

  const handleOperatorChange = (newOperator: SmartPlaylistOperator) => {
    const noValueOperators: SmartPlaylistOperator[] = [
      'is_true',
      'is_false',
      'is_null',
      'is_not_null'
    ];
    let nextValue: RuleCondition['value'] | undefined;
    if (noValueOperators.includes(newOperator)) {
      nextValue = undefined;
    } else if (condition.value === undefined || condition.value === '') {
      if (currentMeta.type === 'number') {
        nextValue = condition.field === 'year' ? 2020 : condition.field === 'bitRate' ? 320 : 0;
      } else if (
        currentMeta.type === 'date' ||
        newOperator === 'in_last' ||
        newOperator === 'not_in_last'
      ) {
        nextValue = 30;
      } else {
        nextValue = '';
      }
    } else {
      nextValue = condition.value;
    }

    onChange({
      ...condition,
      operator: newOperator,
      value: nextValue
    });
  };

  const isNoValueOperator =
    condition.operator === 'is_true' ||
    condition.operator === 'is_false' ||
    condition.operator === 'is_null' ||
    condition.operator === 'is_not_null';

  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
      {/* Field Selector */}
      <select
        value={condition.field}
        onChange={(e) => handleFieldChange(e.target.value as SmartPlaylistField)}
        aria-label="Filter field"
        className="bg-background-color-2 text-font-color-black dark:bg-dark-background-color-2 dark:text-font-color-white focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight h-9 rounded-lg border border-black/10 px-3 py-1 font-medium outline-hidden transition-colors dark:border-white/10"
      >
        {Object.values(SMART_PLAYLIST_FIELDS).map((meta) => (
          <option key={meta.key} value={meta.key}>
            {meta.label} {meta.unit ? `(${meta.unit})` : ''}
          </option>
        ))}
      </select>

      {/* Operator Selector */}
      <select
        value={condition.operator}
        onChange={(e) => handleOperatorChange(e.target.value as SmartPlaylistOperator)}
        aria-label="Filter operator"
        className="bg-background-color-2 text-font-color-black dark:bg-dark-background-color-2 dark:text-font-color-white focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight h-9 rounded-lg border border-black/10 px-3 py-1 font-medium outline-hidden transition-colors dark:border-white/10"
      >
        {currentMeta.allowedOperators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op] || op}
          </option>
        ))}
      </select>

      {/* Value Input */}
      {!isNoValueOperator && (
        <div className="flex items-center gap-1">
          {currentMeta.type === 'number' || currentMeta.type === 'date' ? (
            <div className="relative flex items-center">
              <input
                type="number"
                aria-label="Filter value"
                value={
                  typeof condition.value === 'number' || typeof condition.value === 'string'
                    ? condition.value
                    : ''
                }
                min={
                  condition.operator === 'in_last' || condition.operator === 'not_in_last'
                    ? 1
                    : currentMeta.type === 'number' && condition.field !== 'year'
                      ? 0
                      : undefined
                }
                step={
                  condition.operator === 'in_last' ||
                  condition.operator === 'not_in_last' ||
                  condition.field === 'year' ||
                  condition.field === 'playCount' ||
                  condition.field === 'skipCount'
                    ? 1
                    : undefined
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    onChange({ ...condition, value: '' });
                  } else {
                    const parsed = Number(raw);
                    onChange({
                      ...condition,
                      value: Number.isNaN(parsed) ? '' : parsed
                    });
                  }
                }}
                placeholder="0"
                className="bg-background-color-2 text-font-color-black dark:bg-dark-background-color-2 dark:text-font-color-white focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight h-9 w-28 rounded-lg border border-black/10 px-3 py-1 outline-hidden transition-colors dark:border-white/10"
              />
              {currentMeta.unit && (
                <span className="text-font-color-black/50 dark:text-font-color-white/50 ml-1.5 text-xs font-semibold">
                  {currentMeta.unit}
                </span>
              )}
            </div>
          ) : (
            <input
              type="text"
              aria-label="Filter value"
              value={String(condition.value ?? '')}
              onChange={(e) => onChange({ ...condition, value: e.target.value })}
              placeholder={`Enter ${currentMeta.label.toLowerCase()}...`}
              className="bg-background-color-2 text-font-color-black dark:bg-dark-background-color-2 dark:text-font-color-white focus:border-font-color-highlight dark:focus:border-dark-font-color-highlight h-9 w-52 rounded-lg border border-black/10 px-3 py-1 outline-hidden transition-colors dark:border-white/10"
            />
          )}
        </div>
      )}

      {/* Delete Condition Button */}
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          title="Remove rule"
          aria-label="Remove rule"
          className="text-font-color-black/60 hover:text-font-color-black hover:bg-background-color-3 dark:text-font-color-white/60 dark:hover:text-font-color-white dark:hover:bg-dark-background-color-3 ml-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors"
        >
          <span className="material-icons-round text-base">close</span>
        </button>
      )}
    </div>
  );
});

RuleRow.displayName = 'RuleRow';
