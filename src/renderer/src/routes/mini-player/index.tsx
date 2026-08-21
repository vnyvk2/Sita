import { dispatch } from '@renderer/store/store';
import { createFileRoute, Navigate } from '@tanstack/react-router';

// eslint-disable-next-line react/only-export-components
export const Route = createFileRoute('/mini-player/')({
  beforeLoad: () => {
    dispatch({ type: 'UPDATE_PLAYER_TYPE', data: 'mini' });
  },
  component: RouteComponent
});

function RouteComponent() {
  return <Navigate to="/main-player/home" replace />;
}
