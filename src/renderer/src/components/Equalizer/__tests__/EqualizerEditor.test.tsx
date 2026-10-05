// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUpdateContext, type AppUpdateContextType } from '../../../contexts/AppUpdateContext';
import EqualizerEditor from '../EqualizerEditor';

vi.mock('../../../hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    equalizerPreset: {
      id: 1,
      name: 'flat',
      frequencyBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    saveEqualizerPreset: vi.fn()
  })
}));

describe('EqualizerEditor Component', () => {
  const mockUpdateEqualizerOptions = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(
      <AppUpdateContext.Provider
        value={
          {
            updateEqualizerOptions: mockUpdateEqualizerOptions
          } as unknown as AppUpdateContextType
        }
      >
        <EqualizerEditor {...props} />
      </AppUpdateContext.Provider>
    );
  };

  it('renders the preset dropdown and 10 band sliders', () => {
    const { container } = renderComponent();

    const dropdown = container.querySelector(
      '#setting-equalizer-preset .dropdown-container button'
    );
    expect(dropdown).not.toBeNull();

    const sliders = container.querySelectorAll('#setting-equalizer-sliders input[type="range"]');
    expect(sliders.length).toBe(10);
  });

  it('renders frequency labels for all bands', () => {
    const { getByText } = renderComponent();

    expect(getByText('32Hz')).toBeDefined();
    expect(getByText('64Hz')).toBeDefined();
    expect(getByText('125Hz')).toBeDefined();
    expect(getByText('250Hz')).toBeDefined();
    expect(getByText('500Hz')).toBeDefined();
    expect(getByText('1000Hz')).toBeDefined();
    expect(getByText('2KHz')).toBeDefined();
    expect(getByText('4KHz')).toBeDefined();
    expect(getByText('8KHz')).toBeDefined();
    expect(getByText('16KHz')).toBeDefined();
  });

  it('dispatches updateEqualizerOptions when a preset is chosen', () => {
    renderComponent();

    const trigger = screen.getByRole('button', { name: 'Flat' });
    fireEvent.click(trigger);

    const rockOption = screen.getByRole('menuitemradio', { name: /^Rock$/i });
    fireEvent.click(rockOption);

    expect(mockUpdateEqualizerOptions).toHaveBeenCalled();
  });

  it('renders zero-line by default and hides when showZeroLine is false', () => {
    const { container: withLine } = renderComponent({ showZeroLine: true });
    expect(withLine.querySelector('.zero-line')).not.toBeNull();

    const { container: withoutLine } = renderComponent({ showZeroLine: false });
    expect(withoutLine.querySelector('.zero-line')).toBeNull();
  });
});
