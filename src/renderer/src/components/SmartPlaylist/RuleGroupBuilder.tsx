import type { RuleCondition, RuleGroup } from '@common/collections/smartPlaylist';
import { memo } from 'react';

import { RuleRow } from './RuleRow';

interface RuleGroupBuilderProps {
  group: RuleGroup;
  onChange: (updated: RuleGroup) => void;
  onDeleteGroup?: () => void;
  depth?: number;
}

export const RuleGroupBuilder = memo(
  ({ group, onChange, onDeleteGroup, depth = 1 }: RuleGroupBuilderProps) => {
    const handleOperatorToggle = (op: 'and' | 'or') => {
      onChange({ ...group, logicalOperator: op });
    };

    const handleRuleChange = (index: number, updatedRule: RuleCondition | RuleGroup) => {
      const newRules = [...group.rules];
      newRules[index] = updatedRule;
      onChange({ ...group, rules: newRules });
    };

    const handleRuleDelete = (index: number) => {
      const newRules = group.rules.filter((_, i) => i !== index);
      onChange({ ...group, rules: newRules });
    };

    const handleAddCondition = () => {
      const newCondition: RuleCondition = {
        type: 'condition',
        field: 'title',
        operator: 'contains',
        value: ''
      };
      onChange({ ...group, rules: [...group.rules, newCondition] });
    };

    const handleAddSubGroup = () => {
      if (depth >= 3) return;
      const newSubGroup: RuleGroup = {
        type: 'group',
        logicalOperator: 'and',
        rules: [
          {
            type: 'condition',
            field: 'genre',
            operator: 'contains',
            value: ''
          }
        ]
      };
      onChange({ ...group, rules: [...group.rules, newSubGroup] });
    };

    return (
      <div
        className={`rounded-xl transition-all ${
          depth === 1
            ? 'bg-background-color-1/70 dark:bg-dark-background-color-1/70 border-black/5 p-4 dark:border-white/5'
            : 'border-font-color-highlight/30 bg-background-color-2/40 dark:bg-dark-background-color-2/40 my-2 border-l-2 p-3 pl-4'
        } border`}
      >
        {/* Header: Match ALL vs ANY and Optional Delete Subgroup */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
            <span className="text-font-color-black/70 dark:text-font-color-white/70">Match</span>
            <div className="bg-background-color-2 dark:bg-dark-background-color-2 inline-flex rounded-lg border border-black/5 p-0.5 dark:border-white/5">
              <button
                type="button"
                onClick={() => handleOperatorToggle('and')}
                className={`cursor-pointer rounded-md px-3 py-1 text-xs font-bold transition-all ${
                  group.logicalOperator === 'and'
                    ? 'bg-font-color-highlight text-font-color-white shadow-xs'
                    : 'text-font-color-black/60 dark:text-font-color-white/60 hover:text-font-color-black dark:hover:text-font-color-white'
                }`}
              >
                ALL (AND)
              </button>
              <button
                type="button"
                onClick={() => handleOperatorToggle('or')}
                className={`cursor-pointer rounded-md px-3 py-1 text-xs font-bold transition-all ${
                  group.logicalOperator === 'or'
                    ? 'bg-font-color-highlight text-font-color-white shadow-xs'
                    : 'text-font-color-black/60 dark:text-font-color-white/60 hover:text-font-color-black dark:hover:text-font-color-white'
                }`}
              >
                ANY (OR)
              </button>
            </div>
            <span className="text-font-color-black/70 dark:text-font-color-white/70">
              of the following rules:
            </span>
          </div>

          {onDeleteGroup && (
            <button
              type="button"
              onClick={onDeleteGroup}
              title="Remove nested group"
              aria-label="Remove group"
              className="text-font-color-black/50 hover:text-font-color-black dark:text-font-color-white/50 dark:hover:text-font-color-white flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-red-500/10 hover:text-red-500"
            >
              <span className="material-icons-round text-sm">delete_outline</span>
            </button>
          )}
        </div>

        {/* Child Rules / Groups */}
        <div className="space-y-1 divide-y divide-black/5 dark:divide-white/5">
          {group.rules.map((child, index) => {
            if (child.type === 'condition') {
              return (
                <RuleRow
                  key={`condition-${index}`}
                  condition={child}
                  onChange={(updated) => handleRuleChange(index, updated)}
                  onDelete={() => handleRuleDelete(index)}
                  canDelete={group.rules.length > 1 || Boolean(onDeleteGroup)}
                />
              );
            }

            return (
              <RuleGroupBuilder
                key={`group-${index}`}
                group={child}
                onChange={(updated) => handleRuleChange(index, updated)}
                onDeleteGroup={() => handleRuleDelete(index)}
                depth={depth + 1}
              />
            );
          })}
        </div>

        {/* Footer Actions: Add Rule / Add Nested Group */}
        <div className="mt-3 flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleAddCondition}
            className="text-font-color-black dark:text-font-color-white bg-background-color-2 hover:bg-background-color-3 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-3 flex cursor-pointer items-center gap-1.5 rounded-lg border border-black/5 px-3 py-1.5 text-xs font-semibold transition-all dark:border-white/5"
          >
            <span className="material-icons-round text-sm">add</span>
            Add Rule
          </button>

          {depth < 3 && (
            <button
              type="button"
              onClick={handleAddSubGroup}
              className="text-font-color-black/70 hover:text-font-color-black dark:text-font-color-white/70 dark:hover:text-font-color-white bg-background-color-2/50 hover:bg-background-color-2 dark:bg-dark-background-color-2/50 dark:hover:bg-dark-background-color-2 flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-black/10 px-3 py-1.5 text-xs font-medium transition-all dark:border-white/10"
            >
              <span className="material-icons-round text-sm">folder_open</span>
              Add Nested Group
            </button>
          )}
        </div>
      </div>
    );
  }
);

RuleGroupBuilder.displayName = 'RuleGroupBuilder';
