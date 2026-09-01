import NavigationControlsContainer from '@renderer/components/TitleBar/NavigationControlsContainer';
// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockHistoryBack = vi.fn();
const mockNavigate = vi.fn();
let mockCanGoBackValue = false;

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    history: {
      back: mockHistoryBack
    },
    navigate: mockNavigate
  }),
  useCanGoBack: () => mockCanGoBackValue
}));

vi.mock('@renderer/store/store', async () => {
  const { Store } = await import('@tanstack/store');
  return {
    store: new Store({
      bodyBackgroundImage: undefined
    }),
    dispatch: vi.fn()
  };
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key
    })
  };
});

describe('NavigationControlsContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanGoBackValue = false;
  });

  it('hides back and home buttons when useCanGoBack is false (initial boot)', () => {
    mockCanGoBackValue = false;
    const { container } = render(<NavigationControlsContainer />);

    const backButton = container.querySelector('.previousPageBtn');
    expect(backButton?.className).toContain('invisible');
    expect(backButton?.className).not.toContain('visible!');

    const homeButton = container.querySelector('.goToHomePageBtn');
    expect(homeButton?.className).toContain('invisible');
    expect(homeButton?.className).not.toContain('visible!');
  });

  it('shows back and home buttons when useCanGoBack is true', () => {
    mockCanGoBackValue = true;
    const { container } = render(<NavigationControlsContainer />);

    const backButton = container.querySelector('.previousPageBtn');
    expect(backButton?.className).toContain('visible!');

    const homeButton = container.querySelector('.goToHomePageBtn');
    expect(homeButton?.className).toContain('visible!');
  });

  it('triggers history.back when back button is clicked', () => {
    mockCanGoBackValue = true;
    const { container } = render(<NavigationControlsContainer />);

    const backButton = container.querySelector('.previousPageBtn');
    expect(backButton).toBeTruthy();
    fireEvent.click(backButton!);

    expect(mockHistoryBack).toHaveBeenCalledTimes(1);
  });

  it('navigates to /main-player/home without replace: true when home button is clicked', () => {
    mockCanGoBackValue = true;
    const { container } = render(<NavigationControlsContainer />);

    const homeButton = container.querySelector('.goToHomePageBtn');
    expect(homeButton).toBeTruthy();
    fireEvent.click(homeButton!);

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/main-player/home' });
    // Verify it is NOT called with replace: true
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.objectContaining({ replace: true }));
  });

  it('respects disableHomeButton prop', () => {
    mockCanGoBackValue = true;
    const { container } = render(<NavigationControlsContainer disableHomeButton={true} />);

    const homeButton = container.querySelector('.goToHomePageBtn');
    expect(homeButton).toBeNull();
  });
});
