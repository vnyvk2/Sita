import { describe, expect, it, vi } from 'vitest';

import { MetadataWorkflowService } from '../MetadataWorkflowService';

describe('DEF-TAG-06: workflow undo reads the shared orchestrator journal', () => {
  it('delegates undoLastAutoTag to the shared apply service when configured', async () => {
    const applyService = {
      undoLastAutoTag: vi.fn().mockResolvedValue({ success: true, restoredCount: 2 })
    };
    const transactionManager = {
      rollbackLastTransaction: vi
        .fn()
        .mockResolvedValue({ success: true, revertedCount: 0, errors: [] })
    };
    const service = new MetadataWorkflowService({
      transactionManager: transactionManager as any,
      applyService: applyService as any
    });

    const res = await service.undoLastAutoTag();

    expect(applyService.undoLastAutoTag).toHaveBeenCalledTimes(1);
    expect(transactionManager.rollbackLastTransaction).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, revertedCount: 2, errors: [] });
  });

  it('falls back to the transaction manager when no apply service is wired', async () => {
    const transactionManager = {
      rollbackLastTransaction: vi
        .fn()
        .mockResolvedValue({ success: true, revertedCount: 0, errors: [] })
    };
    const service = new MetadataWorkflowService({
      transactionManager: transactionManager as any
    });

    const res = await service.undoLastAutoTag();

    expect(transactionManager.rollbackLastTransaction).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true, revertedCount: 0, errors: [] });
  });
});
