import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@main/db/db';
import generatePalette, { savePalette } from '@main/other/generatePalette';
import generateCoverBuffer from '@main/parseSong/generateCoverBuffer';
import { CURRENT_PALETTE_GENERATOR_VERSION, PaletteJob } from '../paletteJob';

vi.mock('@main/db/db', () => ({
  db: {
    query: {
      palettes: {
        findFirst: vi.fn()
      }
    },
    transaction: vi.fn()
  }
}));

vi.mock('@main/other/generatePalette', () => ({
  default: vi.fn(),
  savePalette: vi.fn()
}));

vi.mock('@main/parseSong/generateCoverBuffer', () => ({
  default: vi.fn()
}));

describe('PaletteJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip generation if palette already exists and is up to date', async () => {
    vi.mocked(db.query.palettes.findFirst).mockResolvedValue({
      id: 1,
      artworkId: 10,
      generatorVersion: CURRENT_PALETTE_GENERATOR_VERSION
    } as any);

    const job = new PaletteJob(10, '/artworks/10.webp', 'Test Album');
    await job.execute();

    expect(generateCoverBuffer).not.toHaveBeenCalled();
    expect(generatePalette).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('should extract colors and save palette to DB when missing or outdated', async () => {
    vi.mocked(db.query.palettes.findFirst).mockResolvedValue(null as any);
    vi.mocked(generateCoverBuffer).mockResolvedValue(Buffer.from([1, 2, 3]) as any);
    const mockPalette = { primary: '#fff', secondary: '#000' };
    vi.mocked(generatePalette).mockResolvedValue(mockPalette as any);

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback({} as any);
    });

    const job = new PaletteJob(10, '/artworks/10.webp', 'Test Album');
    await job.execute();

    expect(generateCoverBuffer).toHaveBeenCalledWith('/artworks/10.webp', false);
    expect(generatePalette).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(db.transaction).toHaveBeenCalled();
    expect(savePalette).toHaveBeenCalledWith(10, mockPalette, expect.anything());
  });
});
