// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUpdateContext, type AppUpdateContextType } from '../../../contexts/AppUpdateContext';
import AudioFxModal from '../AudioFxModal';

const mockPlayer = {
  getAudioFx: () => ({
    preset: 'normal',
    playbackRate: 1.0,
    preservesPitch: true,
    reverbWet: 0.0,
    reverbDecay: 1.5,
    lowPassCutoff: 20000,
    trebleBoostGain: 0.0
  }),
  getNightModeReduction: () => 0,
  on: vi.fn(),
  off: vi.fn(),
  setAudioFxPreset: vi.fn(),
  setSoundProfile: vi.fn(),
  applyEqualizerPreset: vi.fn()
};

vi.mock('../../../hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => mockPlayer
}));

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

describe('AudioFxModal Component — Tabbed Layout & Orthogonality', () => {
  const mockChangePromptMenuData = vi.fn();
  const mockUpdateEqualizerOptions = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(
      <AppUpdateContext.Provider
        value={
          {
            changePromptMenuData: mockChangePromptMenuData,
            updateEqualizerOptions: mockUpdateEqualizerOptions
          } as unknown as AppUpdateContextType
        }
      >
        <AudioFxModal {...props} />
      </AppUpdateContext.Provider>
    );
  };

  it('lands on the Effects tab by default and shows the Reset to Normal button', () => {
    renderComponent();

    // Tab buttons exist
    const effectsTabBtn = screen.getByRole('button', { name: /Studio Effects & DSP/i });
    const eqTabBtn = screen.getByRole('button', { name: /10-Band Equalizer/i });
    expect(effectsTabBtn).toBeDefined();
    expect(eqTabBtn).toBeDefined();

    // Reset button for FX is rendered on the effects tab
    const resetBtn = screen.getByRole('button', { name: /Reset to Default/i });
    expect(resetBtn).toBeDefined();

    // Done button is rendered
    const doneBtn = screen.getByRole('button', { name: /Done/i });
    expect(doneBtn).toBeDefined();
  });

  it('switches between Effects and Equalizer tabs on click without remounting', () => {
    const { container } = renderComponent();

    const eqTabBtn = screen.getByRole('button', { name: /10-Band Equalizer/i });
    fireEvent.click(eqTabBtn);

    // Equalizer sliders are present in DOM
    const sliders = container.querySelectorAll('#setting-equalizer-sliders input[type="range"]');
    expect(sliders.length).toBe(10);

    // Footer "Reset to Default" button must NOT be visible on the Equalizer tab
    expect(screen.queryByRole('button', { name: /Reset to Default/i })).toBeNull();

    // Done button remains accessible
    expect(screen.getByRole('button', { name: /Done/i })).toBeDefined();

    // Switch back to Effects tab
    const effectsTabBtn = screen.getByRole('button', { name: /Studio Effects & DSP/i });
    fireEvent.click(effectsTabBtn);

    // Reset to Default button reappears for the FX tab
    expect(screen.getByRole('button', { name: /Reset to Default/i })).toBeDefined();
  });

  it('respects initialTab="equalizer" when passed as a prop', () => {
    renderComponent({ initialTab: 'equalizer' });

    // On equalizer tab initially, so FX Reset to Default is not shown
    expect(screen.queryByRole('button', { name: /Reset to Default/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Done/i })).toBeDefined();
  });

  it('closes prompt menu when Done button is clicked', () => {
    renderComponent();

    const doneBtn = screen.getByRole('button', { name: /Done/i });
    fireEvent.click(doneBtn);

    expect(mockChangePromptMenuData).toHaveBeenCalledWith(false);
  });
});
