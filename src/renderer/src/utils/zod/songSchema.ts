import { songFilterTypes, songSortTypes } from '@renderer/components/SongsPage/SongOptions';
import { z } from 'zod';

import { baseInfoPageSearchParamsSchema } from './baseInfoPageSearchParamsSchema';

export const songSearchSchema = baseInfoPageSearchParamsSchema.extend({
  sortingOrder: z.enum(songSortTypes).optional(),
  filteringOrder: z.enum(songFilterTypes).optional(),
  period: z.enum(['all', '1', '7', '30', '90', '365']).optional(),
  mostPlayedLimit: z.coerce.number().int().min(1).max(1000).optional(),
  action: z.enum(['add-to-queue']).optional(),
  queueIndex: z.coerce.number().optional(),
  keyword: z.string().optional(),
  language: z.string().optional(),
  genre: z.string().optional(),
  onlyFavoriteArtists: z.boolean().optional(),
  onlyFavoriteAlbums: z.boolean().optional()
});

export type SongSearchSchema = z.infer<typeof songSearchSchema>;
