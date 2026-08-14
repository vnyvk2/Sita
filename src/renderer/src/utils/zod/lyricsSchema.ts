import { z } from 'zod';

export const lyricsSchema = z.object({
  isAutoScrolling: z.boolean().optional().default(true),
  from: z.string().optional()
});

export type LyricsSchema = z.infer<typeof lyricsSchema>;
