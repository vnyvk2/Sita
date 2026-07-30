import type { BatchItem } from '../models/BatchItem';

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
}
