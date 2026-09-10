import {
  HierarchyService,
  type PlaylistNode
} from '../../../../../src/main/collections/engine/HierarchyService';

describe('HierarchyService', () => {
  let service: HierarchyService;

  beforeEach(() => {
    service = new HierarchyService();
  });

  describe('topologicalOrder', () => {
    it('should sort nodes parents before children', () => {
      const nodes: PlaylistNode[] = [
        { id: 3, parentId: 2, name: 'Child 1', playlistType: 'standard' },
        { id: 4, parentId: 2, name: 'Child 2', playlistType: 'standard' },
        { id: 1, parentId: null, name: 'Root', playlistType: 'folder' },
        { id: 2, parentId: 1, name: 'Parent', playlistType: 'folder' }
      ];

      const sorted = service.topologicalOrder(nodes);

      expect(sorted.length).toBe(4);

      const ids = sorted.map((n) => n.id);

      // Root (1) must be before Parent (2)
      expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(2));
      // Parent (2) must be before children (3, 4)
      expect(ids.indexOf(2)).toBeLessThan(ids.indexOf(3));
      expect(ids.indexOf(2)).toBeLessThan(ids.indexOf(4));
    });

    it('should handle disjoint trees correctly', () => {
      const nodes: PlaylistNode[] = [
        { id: 11, parentId: 10, name: 'C1', playlistType: 'standard' },
        { id: 10, parentId: null, name: 'R1', playlistType: 'folder' },
        { id: 21, parentId: 20, name: 'C2', playlistType: 'standard' },
        { id: 20, parentId: null, name: 'R2', playlistType: 'folder' }
      ];

      const sorted = service.topologicalOrder(nodes);
      const ids = sorted.map((n) => n.id);

      expect(ids.indexOf(10)).toBeLessThan(ids.indexOf(11));
      expect(ids.indexOf(20)).toBeLessThan(ids.indexOf(21));
    });

    it('should handle missing parents gracefully (partial subset)', () => {
      const nodes: PlaylistNode[] = [
        { id: 3, parentId: 2, name: 'Child 1', playlistType: 'standard' },
        { id: 4, parentId: 2, name: 'Child 2', playlistType: 'standard' }
      ];

      // Since parent (2) is missing from the subset, it should just include 3 and 4
      const sorted = service.topologicalOrder(nodes);
      expect(sorted.length).toBe(2);
      expect(sorted.map((n) => n.id).sort()).toEqual([3, 4]);
    });
  });
});
