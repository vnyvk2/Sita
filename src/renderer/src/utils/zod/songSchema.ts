import { songFilterTypes, songSortTypes } from '@renderer/components/SongsPage/SongOptions';
import { z } from 'zod';

import { baseInfoPageSearchParamsSchema } from './baseInfoPageSearchParamsSchema';

export const songSearchSchema = baseInfoPageSearchParamsSchema.extend({
  sortingOrder: z.enum(songSortTypes).optional(),
  filteringOrder: z.enum(songFilterTypes).optional(),
  action: z.enum(['add-to-queue']).optional(),
  queueIndex: z.coerce.number().optional()
});

export type SongSearchSchema = z.infer<typeof songSearchSchema>;
