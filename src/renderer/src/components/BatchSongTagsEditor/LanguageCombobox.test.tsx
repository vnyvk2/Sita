// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LanguageCombobox from './LanguageCombobox';

describe('LanguageCombobox Component', () => {
  it('renders input with initial value and placeholder', () => {
    render(<LanguageCombobox value="Telugu" onChange={() => {}} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Telugu');
  });

  it('opens suggestions dropdown when input is focused and allows selection', () => {
    const handleChange = vi.fn();
    render(<LanguageCombobox value="" onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);

    // Should render list of known languages
    expect(screen.getByText('Telugu')).toBeDefined();
    expect(screen.getByText('Hindi')).toBeDefined();

    fireEvent.mouseDown(screen.getByText('Telugu'));
    expect(handleChange).toHaveBeenCalledWith('Telugu');
  });

  it('filters languages based on search input and allows custom language', () => {
    const handleChange = vi.fn();
    render(<LanguageCombobox value="" onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'klingon' } });

    // Custom language option should appear
    const customOption = screen.getByText(/Use custom: "Klingon"/);
    expect(customOption).toBeDefined();

    fireEvent.mouseDown(customOption);
    expect(handleChange).toHaveBeenCalledWith('Klingon');
  });

  it('clears language when clear button is clicked', () => {
    const handleChange = vi.fn();
    render(<LanguageCombobox value="Telugu" onChange={handleChange} />);

    const clearButton = screen.getByTitle('Clear language');
    fireEvent.click(clearButton);

    expect(handleChange).toHaveBeenCalledWith('');
  });

  it('normalizes ISO code when submitted via Enter key', () => {
    const handleChange = vi.fn();
    render(<LanguageCombobox value="" onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'tel' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith('Telugu');
  });
});
