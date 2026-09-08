import { useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';

/**
 * Toggles overlay-style routes (Lyrics, Queue).
 *
 * If already viewing the overlay, closes it by returning to the previous history entry. Otherwise
 * navigates to the overlay.
 */
export function useOverlayNavigation() {
  const router = useRouter();

  const toggleOverlay = useCallback(
    (path: string) => {
      if (router.state.location.pathname.startsWith(path)) {
        router.history.back();
      } else {
        router.navigate({ to: path });
      }
    },
    [router]
  );

  return { toggleOverlay };
}
