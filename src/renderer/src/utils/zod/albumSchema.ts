import { albumFilterTypes, albumSortTypes } from '@renderer/utils/albumFilters';
import { z } from 'zod';

import { baseInfoPageSearchParamsSchema } from './baseInfoPageSearchParamsSchema';

export const albumSearchSchema = baseInfoPageSearchParamsSchema.extend({
  sortingOrder: z.enum(albumSortTypes).optional(),
  filteringOrder: z.enum(albumFilterTypes).optional(),
  keyword: z.string().optional()
});

export type AlbumSearchSchema = z.infer<typeof albumSearchSchema>;
