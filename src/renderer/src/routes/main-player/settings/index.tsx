import SettingsPage from '@renderer/components/SettingsPage/SettingsPage';
import { settingsQuery } from '@renderer/queries/settings';
import { queryClient } from '@renderer/queryClient';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const settingsSearchSchema = z.object({
  highlight: z.string().optional(),
  section: z.string().optional()
});

export const Route = createFileRoute('/main-player/settings/')({
  validateSearch: settingsSearchSchema,
  component: RouteComponent,
  loader: async () => {
    await queryClient.ensureQueryData(settingsQuery.all);
  }
});

function RouteComponent() {
  const { highlight, section } = Route.useSearch();
  return <SettingsPage initialHighlight={highlight} initialSection={section} />;
}
