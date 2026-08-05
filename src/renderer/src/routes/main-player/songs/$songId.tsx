import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/main-player/songs/$songId')({
  component: SongIdLayout
});

function SongIdLayout() {
  return <Outlet />;
}
