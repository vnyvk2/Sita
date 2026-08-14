// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import HighlightedText from '../../../../../src/renderer/src/components/SearchPage/HighlightedText';

describe('HighlightedText', () => {
  it('should render the original text when highlight is empty', () => {
    render(<HighlightedText text="Hello World" highlight="" />);
    expect(screen.getByText('Hello World')).toBeDefined();
  });

  it('should highlight the exact matching part', () => {
    const { container } = render(<HighlightedText text="Hello World" highlight="World" />);
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('World');
  });

  it('should highlight multiple occurrences regardless of case', () => {
    const { container } = render(<HighlightedText text="ab ab c ab" highlight="AB" />);
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(3);
    marks.forEach(mark => {
      expect(mark.textContent).toBe('ab');
    });
  });

  it('should not throw on special regex characters', () => {
    const { container } = render(<HighlightedText text="Hello (World)" highlight="(World)" />);
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('(World)');
  });
});
