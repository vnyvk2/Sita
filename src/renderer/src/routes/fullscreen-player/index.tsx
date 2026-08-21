import { dispatch } from '@renderer/store/store';
import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/fullscreen-player/')({
  beforeLoad: () => {
    dispatch({ type: 'UPDATE_PLAYER_TYPE', data: 'full' });
  },
  component: RouteComponent
});

function RouteComponent() {
  return <Navigate to="/main-player/home" replace />;
}
