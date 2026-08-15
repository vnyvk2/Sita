import { useNavigate, type NavigateOptions } from '@tanstack/react-router';
import { useCallback, useContext } from 'react';

import { AppUpdateContext } from '../contexts/AppUpdateContext';

export function useOpenMainPlayerRoute() {
  const navigate = useNavigate();
  const { updatePlayerType } = useContext(AppUpdateContext);

  return useCallback(
    async (options: NavigateOptions) => {
      await updatePlayerType('normal');
      (navigate as (opts: NavigateOptions) => void)(options);
    },
    [navigate, updatePlayerType]
  );
}
