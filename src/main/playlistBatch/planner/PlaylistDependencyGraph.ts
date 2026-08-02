import type { BatchItem } from '../models/BatchItem';
import type { ExecutionLevel } from '../models/ExecutionLevel';

export class PlaylistDependencyGraph {
  sortTopologically(items: BatchItem[]): string[] {
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const visited = new Set<string>();
    const temp = new Set<string>();
    const order: string[] = [];

    const visit = (id: string) => {
      if (temp.has(id)) {
        throw new Error(`Circular dependency detected in batch item: ${id}`);
      }
      if (!visited.has(id)) {
        temp.add(id);
        const item = itemMap.get(id);
        if (item) {
          for (const depId of item.dependencies) {
            if (itemMap.has(depId)) {
              visit(depId);
            }
          }
        }
        temp.delete(id);
        visited.add(id);
        order.push(id);
      }
    };

    for (const item of items) {
      if (!visited.has(item.id)) {
        visit(item.id);
      }
    }

    return order;
  }

  computeExecutionLevels(items: BatchItem[]): ExecutionLevel[] {
    const levels: ExecutionLevel[] = [];
    const processed = new Set<string>();
    const itemMap = new Map(items.map((item) => [item.id, item]));

    let remaining = [...items];
    let levelNumber = 0;

    while (remaining.length > 0) {
      const currentLevel = remaining.filter((item) =>
        item.dependencies.every((depId) => processed.has(depId) || !itemMap.has(depId))
      );

      if (currentLevel.length === 0) {
        throw new Error('Circular dependency or unsatisfied requirement detected in execution levels calculation');
      }

      const levelIds = currentLevel.map((i) => i.id);
      levels.push({
        level: levelNumber++,
        items: levelIds,
        parallelizable: levelIds.length > 1
      });

      for (const id of levelIds) {
        processed.add(id);
      }

      remaining = remaining.filter((item) => !processed.has(item.id));
    }

    return levels;
  }
}
