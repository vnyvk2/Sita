import type { RuleGroup } from '@common/collections/smartPlaylist';
import { RuleGroupBuilder } from '@renderer/components/SmartPlaylist/RuleGroupBuilder';
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

describe('RuleGroupBuilder component', () => {
  const initialGroup: RuleGroup = {
    type: 'group',
    logicalOperator: 'and',
    rules: [
      {
        type: 'condition',
        field: 'title',
        operator: 'contains',
        value: 'rock'
      }
    ]
  };

  it('renders logical operator toggles for ALL (and) and ANY (or)', () => {
    const onChange = vi.fn();
    render(<RuleGroupBuilder group={initialGroup} onChange={onChange} />);

    const allBtn = screen.getByRole('button', { name: /all/i });
    const anyBtn = screen.getByRole('button', { name: /any/i });

    expect(allBtn).toBeDefined();
    expect(anyBtn).toBeDefined();

    fireEvent.click(anyBtn);
    expect(onChange).toHaveBeenCalledWith({
      ...initialGroup,
      logicalOperator: 'or'
    });
  });

  it('adds a new rule condition when Add Rule is clicked', () => {
    const onChange = vi.fn();
    render(<RuleGroupBuilder group={initialGroup} onChange={onChange} />);

    const addRuleBtn = screen.getByRole('button', { name: /add rule/i });
    fireEvent.click(addRuleBtn);

    expect(onChange).toHaveBeenCalledWith({
      ...initialGroup,
      rules: [
        ...initialGroup.rules,
        {
          type: 'condition',
          field: 'title',
          operator: 'contains',
          value: ''
        }
      ]
    });
  });

  it('allows adding nested group when depth < 3', () => {
    const onChange = vi.fn();
    render(<RuleGroupBuilder group={initialGroup} onChange={onChange} depth={2} />);

    const addGroupBtn = screen.getByRole('button', { name: /add nested group/i });
    expect(addGroupBtn).toBeDefined();
    fireEvent.click(addGroupBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: expect.arrayContaining([
          expect.objectContaining({
            type: 'group',
            logicalOperator: 'and'
          })
        ])
      })
    );
  });

  it('hides Add Nested Group button when depth is 3', () => {
    const onChange = vi.fn();
    render(<RuleGroupBuilder group={initialGroup} onChange={onChange} depth={3} />);

    const addGroupBtn = screen.queryByRole('button', { name: /add nested group/i });
    expect(addGroupBtn).toBeNull();
  });
});
