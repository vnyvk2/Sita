import { z } from 'zod';

export const lyricsSchema = z.object({
  from: z.string().optional()
});

export type LyricsSchema = z.infer<typeof lyricsSchema>;
