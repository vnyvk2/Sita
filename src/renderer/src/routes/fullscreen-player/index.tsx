import { dispatch } from '@renderer/store/store';
import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/fullscreen-player/')({
  component: RouteComponent
});

function RouteComponent() {
  dispatch({ type: 'UPDATE_PLAYER_TYPE', data: 'full' });
  return <Navigate to="/main-player/home" replace />;
}
