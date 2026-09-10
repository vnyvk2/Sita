import type { RuleCondition } from '@common/collections/smartPlaylist';
import { RuleRow } from '@renderer/components/SmartPlaylist/RuleRow';
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

describe('RuleRow component', () => {
  const defaultCondition: RuleCondition = {
    type: 'condition',
    field: 'title',
    operator: 'contains',
    value: 'Queen'
  };

  it('renders field selector, operator selector, and value input', () => {
    const onChange = vi.fn();
    const onDelete = vi.fn();

    render(<RuleRow condition={defaultCondition} onChange={onChange} onDelete={onDelete} />);

    // Expect field select
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(2);

    // Expect value input
    const input = screen.getByDisplayValue('Queen');
    expect(input).toBeDefined();
  });

  it('triggers onDelete when remove button is clicked', () => {
    const onChange = vi.fn();
    const onDelete = vi.fn();

    render(
      <RuleRow
        condition={defaultCondition}
        onChange={onChange}
        onDelete={onDelete}
        canDelete={true}
      />
    );

    const deleteBtn = screen.getByTitle('Remove rule');
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('updates condition value when text input changes', () => {
    const onChange = vi.fn();
    const onDelete = vi.fn();

    render(<RuleRow condition={defaultCondition} onChange={onChange} onDelete={onDelete} />);

    const input = screen.getByDisplayValue('Queen');
    fireEvent.change(input, { target: { value: 'Beatles' } });

    expect(onChange).toHaveBeenCalledWith({
      ...defaultCondition,
      value: 'Beatles'
    });
  });

  it('does not render text input for is_true / is_false / is_null / is_not_null operators', () => {
    const boolCondition: RuleCondition = {
      type: 'condition',
      field: 'isFavorite',
      operator: 'is_true'
    };

    const onChange = vi.fn();
    const onDelete = vi.fn();

    render(<RuleRow condition={boolCondition} onChange={onChange} onDelete={onDelete} />);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('sets value to undefined when switching to a boolean field with unary operator', () => {
    const onChange = vi.fn();
    const onDelete = vi.fn();

    render(<RuleRow condition={defaultCondition} onChange={onChange} onDelete={onDelete} />);

    const fieldSelect = screen.getByLabelText('Filter field');
    fireEvent.change(fieldSelect, { target: { value: 'isFavorite' } });

    expect(onChange).toHaveBeenCalledWith({
      type: 'condition',
      field: 'isFavorite',
      operator: 'is_true',
      value: undefined
    });
  });

  it('sets value to undefined when switching operator to is_null', () => {
    const albumCondition: RuleCondition = {
      type: 'condition',
      field: 'album',
      operator: 'eq',
      value: 'Abbey Road'
    };
    const onChange = vi.fn();
    const onDelete = vi.fn();

    render(<RuleRow condition={albumCondition} onChange={onChange} onDelete={onDelete} />);

    const opSelect = screen.getByLabelText('Filter operator');
    fireEvent.change(opSelect, { target: { value: 'is_null' } });

    expect(onChange).toHaveBeenCalledWith({
      ...albumCondition,
      operator: 'is_null',
      value: undefined
    });
  });

  it('enforces min=1 on in_last date conditions', () => {
    const dateCondition: RuleCondition = {
      type: 'condition',
      field: 'addedAt',
      operator: 'in_last',
      value: 30
    };

    const onChange = vi.fn();
    const onDelete = vi.fn();

    render(<RuleRow condition={dateCondition} onChange={onChange} onDelete={onDelete} />);

    const spinInput = screen.getByRole('spinbutton');
    expect(spinInput.getAttribute('min')).toBe('1');
    expect(spinInput.getAttribute('step')).toBe('1');
  });
});
