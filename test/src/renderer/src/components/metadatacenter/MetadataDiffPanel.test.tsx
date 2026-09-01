// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';

import type { MetadataFieldDiff } from '../../../../../../src/common/metadata/types';
import { MetadataDiffPanel } from '../../../../../../src/renderer/src/components/metadatacenter/MetadataDiffPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        'common.addedToGenres': 'Added to Genres'
      };
      return translations[key] || fallback || key;
    }
  })
}));

describe('MetadataDiffPanel Component', () => {
  afterEach(() => {
    cleanup();
  });

  const mockDiffs: MetadataFieldDiff[] = [
    {
      fieldId: 'title',
      fieldName: 'Title',
      oldValue: 'Old Title',
      suggestedValue: 'New Title',
      status: 'changed',
      applyField: true
    },
    {
      fieldId: 'genre',
      fieldName: 'Genre',
      oldValue: 'Rock',
      suggestedValue: 'Electronic',
      status: 'changed',
      applyField: true
    },
    {
      fieldId: 'style',
      fieldName: 'Style',
      oldValue: undefined,
      suggestedValue: 'Synth-pop, Darkwave',
      status: 'new',
      applyField: true
    }
  ];

  const TestWrapper = () => {
    const [selected, setSelected] = useState<Set<string>>(new Set(['title', 'genre', 'style']));

    return (
      <MetadataDiffPanel
        fieldDiffs={mockDiffs}
        selectedFieldIds={selected}
        onToggleField={(id) => {
          setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }}
      />
    );
  };

  it('renders all diff cards and displays localized "Added to Genres" hint on Style card', () => {
    const { container } = render(<TestWrapper />);

    expect(screen.getByText('Title')).toBeDefined();
    expect(screen.getByText('Genre')).toBeDefined();
    expect(screen.getByText('Style')).toBeDefined();

    // Verify "Added to Genres" hint is displayed on the Style card
    expect(container.textContent).toContain('Added to Genres');
  });

  it('allows toggling selective field changes', () => {
    render(<TestWrapper />);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[2].checked).toBe(true);

    // Toggle the 3rd field (style) off
    fireEvent.click(checkboxes[2]);
    expect(checkboxes[2].checked).toBe(false);

    // Toggle the 3rd field (style) back on
    fireEvent.click(checkboxes[2]);
    expect(checkboxes[2].checked).toBe(true);
  });
});
