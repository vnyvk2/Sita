import { playlistSortTypes } from '@renderer/components/PlaylistsPage/PlaylistOptions';
import { z } from 'zod';

import { baseInfoPageSearchParamsSchema } from './baseInfoPageSearchParamsSchema';

export const playlistSearchSchema = baseInfoPageSearchParamsSchema.extend({
  sortingOrder: z.enum(playlistSortTypes).optional(),
  keyword: z.string().optional()
});

export type PlaylistSearchSchema = z.infer<typeof playlistSearchSchema>;
