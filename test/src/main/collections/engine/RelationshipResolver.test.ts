import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { HierarchyService } from '../../../../../src/main/collections/engine/HierarchyService';
import { db } from '../../../../../src/main/db/db';
import { playlists } from '../../../../../src/main/db/schema';

describe('HierarchyService Integration (formerly RelationshipResolver)', () => {
  const service = new HierarchyService();

  beforeEach(async () => {
    await db.delete(playlists);
  });

  afterEach(async () => {
    await db.delete(playlists);
  });

  it('should fetch descendants recursively', async () => {
    const [root] = await db
      .insert(playlists)
      .values({ name: 'Root', playlistType: 'folder' })
      .returning({ id: playlists.id });
    const [child1] = await db
      .insert(playlists)
      .values({ name: 'Child 1', parentId: root.id, playlistType: 'folder' })
      .returning({ id: playlists.id });
    const [child2] = await db
      .insert(playlists)
      .values({ name: 'Child 2', parentId: root.id, playlistType: 'standard' })
      .returning({ id: playlists.id });
    const [grandChild] = await db
      .insert(playlists)
      .values({ name: 'Grandchild', parentId: child1.id, playlistType: 'smart' })
      .returning({ id: playlists.id });

    const descendants = await service.getDescendants(root.id);

    expect(descendants.length).toBe(3);
    const ids = descendants.map((d) => d.id);
    expect(ids).toContain(child1.id);
    expect(ids).toContain(child2.id);
    expect(ids).toContain(grandChild.id);
  });

  it('should fetch ancestors sequentially', async () => {
    const [root] = await db
      .insert(playlists)
      .values({ name: 'Root', playlistType: 'folder' })
      .returning({ id: playlists.id });
    const [child1] = await db
      .insert(playlists)
      .values({ name: 'Child 1', parentId: root.id, playlistType: 'folder' })
      .returning({ id: playlists.id });
    const [grandChild] = await db
      .insert(playlists)
      .values({ name: 'Grandchild', parentId: child1.id, playlistType: 'smart' })
      .returning({ id: playlists.id });

    const ancestors = await service.getAncestors(grandChild.id);

    expect(ancestors.length).toBe(2);
    expect(ancestors[0].id).toBe(child1.id);
    expect(ancestors[1].id).toBe(root.id);
  });

  it('should validate moves properly and detect cycles', async () => {
    const [root] = await db
      .insert(playlists)
      .values({ name: 'Root', playlistType: 'folder' })
      .returning({ id: playlists.id });
    const [child] = await db
      .insert(playlists)
      .values({ name: 'Child', parentId: root.id, playlistType: 'folder' })
      .returning({ id: playlists.id });
    const [grandChild] = await db
      .insert(playlists)
      .values({ name: 'Grandchild', parentId: child.id, playlistType: 'folder' })
      .returning({ id: playlists.id });
    const [other] = await db
      .insert(playlists)
      .values({ name: 'Other', playlistType: 'folder' })
      .returning({ id: playlists.id });

    // Moving grandchild to root is valid
    await expect(service.validateMove(grandChild.id, root.id)).resolves.not.toThrow();

    // Moving child to other is valid
    await expect(service.validateMove(child.id, other.id)).resolves.not.toThrow();

    // Moving root to child is INVALID (cycle)
    await expect(service.validateMove(root.id, child.id)).rejects.toThrow(/Cannot move folder/);

    // Moving root to grandchild is INVALID (cycle)
    await expect(service.validateMove(root.id, grandChild.id)).rejects.toThrow(
      /Cannot move folder/
    );

    // Moving root to itself is INVALID
    await expect(service.validateMove(root.id, root.id)).rejects.toThrow(/Cannot move folder/);
  });
});
