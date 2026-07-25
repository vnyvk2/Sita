import { useLocation, useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';

/**
 * Toggles overlay-style routes (Lyrics, Queue).
 *
 * If already viewing the overlay, closes it by returning to the previous history entry. Otherwise
 * navigates to the overlay.
 */
export function useOverlayNavigation() {
  const { history, navigate } = useRouter();
  const location = useLocation();

  const toggleOverlay = useCallback(
    (path: string) => {
      if (location.pathname.startsWith(path)) {
        history.back();
      } else {
        navigate({ to: path });
      }
    },
    [history, location.pathname, navigate]
  );

  return { toggleOverlay };
}
