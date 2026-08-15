import { useNavigate } from '@tanstack/react-router';
import { useCallback, useContext } from 'react';

import { AppUpdateContext } from '../contexts/AppUpdateContext';

export function useOpenMainPlayerRoute() {
  const navigate = useNavigate();
  const { updatePlayerType } = useContext(AppUpdateContext);

  return useCallback(
    async (options: any) => {
      await updatePlayerType('normal');
      navigate(options);
    },
    [navigate, updatePlayerType]
  );
}
