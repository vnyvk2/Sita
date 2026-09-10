import { eq } from 'drizzle-orm';

import { PinOp, UnpinOp } from '../../../../../src/main/collections/operations/PinOp';
import { playlists } from '../../../../../src/main/db/schema';

describe('PinOp', () => {
  it('should set pinnedAt to current date and return unpin as inverse', async () => {
    const mockTrx = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue({})
    };
    const ctx = { trx: mockTrx } as any;

    const op = new PinOp();
    const result = await op.execute({ playlistId: 42 }, ctx);

    expect(mockTrx.update).toHaveBeenCalledWith(playlists);

    // Check that it set pinnedAt to a date
    const setArgs = mockTrx.set.mock.calls[0][0];
    expect(setArgs.pinnedAt).toBeInstanceOf(Date);

    expect(mockTrx.where).toHaveBeenCalledWith(eq(playlists.id, 42));

    expect(result.operationType).toBe('playlist.pin');
    expect(result.inverseInput.operationType).toBe('playlist.unpin');
    expect(result.inverseInput.input).toEqual({ playlistId: 42 });
  });
});

describe('UnpinOp', () => {
  it('should set pinnedAt to null and return pin as inverse', async () => {
    const mockTrx = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue({})
    };
    const ctx = { trx: mockTrx } as any;

    const op = new UnpinOp();
    const result = await op.execute({ playlistId: 42 }, ctx);

    expect(mockTrx.update).toHaveBeenCalledWith(playlists);
    expect(mockTrx.set).toHaveBeenCalledWith({ pinnedAt: null });
    expect(mockTrx.where).toHaveBeenCalledWith(eq(playlists.id, 42));

    expect(result.operationType).toBe('playlist.unpin');
    expect(result.inverseInput.operationType).toBe('playlist.pin');
    expect(result.inverseInput.input).toEqual({ playlistId: 42 });
  });
});
