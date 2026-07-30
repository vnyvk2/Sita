import { describe, it, expect, vi } from 'vitest';
import { FolderStatisticsService } from '../../../../../src/main/collections/engine/FolderStatisticsService';
import { HierarchyService } from '../../../../../src/main/collections/engine/HierarchyService';
import { playlists } from '../../../../../src/main/db/schema';
import { eq } from 'drizzle-orm';

describe('FolderStatisticsService', () => {
  it('should propagate stats correctly', async () => {
    const mockHierarchyService = new HierarchyService();
    mockHierarchyService.getAncestors = vi.fn().mockResolvedValue([
      { id: 2, parentId: 1, name: 'Folder 2', playlistType: 'folder' },
      { id: 1, parentId: null, name: 'Root Folder', playlistType: 'folder' }
    ]);
    
    const service = new FolderStatisticsService(mockHierarchyService);
    
    const mockTrx = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue({})
    };

    await service.propagateStats(100, 2, 45000, mockTrx);
    
    // It should have fetched ancestors
    expect(mockHierarchyService.getAncestors).toHaveBeenCalledWith(100);
    
    // It should have executed updates for both ancestors
    expect(mockTrx.update).toHaveBeenCalledWith(playlists);
    expect(mockTrx.set).toHaveBeenCalledTimes(2);
    expect(mockTrx.where).toHaveBeenCalledTimes(2);
    
    // Using Drizzle's eq
    expect(mockTrx.where).toHaveBeenCalledWith(eq(playlists.id, 2));
  });
  
  it('should skip if delta is 0', async () => {
    const mockHierarchyService = new HierarchyService();
    mockHierarchyService.getAncestors = vi.fn();
    
    const service = new FolderStatisticsService(mockHierarchyService);
    const mockTrx = { update: vi.fn() };
    
    await service.propagateStats(100, 0, 0, mockTrx);
    
    expect(mockHierarchyService.getAncestors).not.toHaveBeenCalled();
    expect(mockTrx.update).not.toHaveBeenCalled();
  });
});
