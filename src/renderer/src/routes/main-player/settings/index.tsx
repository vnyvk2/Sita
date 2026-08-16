import SettingsPage from '@renderer/components/SettingsPage/SettingsPage';
import { settingsQuery } from '@renderer/queries/settings';
import { queryClient } from '@renderer/queryClient';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/main-player/settings/')({
  component: RouteComponent,
  loader: async () => {
    await queryClient.ensureQueryData(settingsQuery.all);
  }
});

function RouteComponent() {
  return <SettingsPage />;
}
