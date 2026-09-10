import { HierarchyService } from '../../../../../src/main/collections/engine/HierarchyService';
import { CollectionNamingStrategy } from '../../../../../src/main/collections/operations/CollectionNamingStrategy';
import { DuplicatePlanner } from '../../../../../src/main/collections/operations/DuplicatePlanner';

vi.mock('../../../../../src/main/db/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi
      .fn()
      .mockResolvedValue([{ id: 1, parentId: null, name: 'Root', playlistType: 'folder' }])
  }
}));

describe('CollectionNamingStrategy', () => {
  it('should append (Copy) to the name', () => {
    const strategy = new CollectionNamingStrategy();
    expect(strategy.generateDuplicateName('My Playlist')).toBe('My Playlist (Copy)');
  });
});

describe('DuplicatePlanner', () => {
  it('should plan duplication with correct naming and topological order', async () => {
    const mockHierarchyService = new HierarchyService();
    // Override getDescendants to return fake children
    mockHierarchyService.getDescendants = vi
      .fn()
      .mockResolvedValue([{ id: 2, parentId: 1, name: 'Child', playlistType: 'standard' }]);

    const strategy = new CollectionNamingStrategy();
    const planner = new DuplicatePlanner(mockHierarchyService, strategy);

    const plan = await planner.plan(1);

    expect(plan.nodes.length).toBe(2);

    // Check root node
    const rootNode = plan.nodes.find((n) => n.node.id === 1);
    expect(rootNode?.newName).toBe('Root (Copy)');

    // Check child node (should not be renamed)
    const childNode = plan.nodes.find((n) => n.node.id === 2);
    expect(childNode?.newName).toBe('Child');

    // Verify topological order: parent (id 1) should be before child (id 2)
    const rootIdx = plan.nodes.findIndex((n) => n.node.id === 1);
    const childIdx = plan.nodes.findIndex((n) => n.node.id === 2);
    expect(rootIdx).toBeLessThan(childIdx);
  });
});
