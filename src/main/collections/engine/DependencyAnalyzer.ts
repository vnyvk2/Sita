import type {
  SmartPlaylistDefinition,
  SmartPlaylistRuleAST,
  SmartPlaylistField
} from '../query/ast';

export class DependencyAnalyzer {
  /**
   * Extracts all field dependencies from a Smart Playlist Definition.
   */
  public static extractDependencies(definition: SmartPlaylistDefinition): SmartPlaylistField[] {
    const fields = new Set<SmartPlaylistField>();

    this.walkAst(definition.rule, fields);

    if (definition.orderBy) {
      for (const order of definition.orderBy) {
        fields.add(order.field);
      }
    }

    return Array.from(fields);
  }

  private static walkAst(node: SmartPlaylistRuleAST, fields: Set<SmartPlaylistField>): void {
    if (node.type === 'condition') {
      fields.add(node.field);
    } else if (node.type === 'group') {
      for (const rule of node.rules) {
        this.walkAst(rule, fields);
      }
    }
  }

  /**
   * Checks if a smart playlist should be regenerated based on the changed metadata fields.
   */
  public static isAffectedByMetadataChange(
    cachedDependencies: SmartPlaylistField[],
    changedFields: SmartPlaylistField[]
  ): boolean {
    if (!cachedDependencies) return true; // Default safe fallback if missing
    if (cachedDependencies.length === 0) return false; // Explicitly empty means no dependencies

    const dependencySet = new Set(cachedDependencies);
    // If any of the changed fields is in our dependencies, we are affected
    for (const field of changedFields) {
      if (dependencySet.has(field)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Maps domain events to potentially changed fields to check against dependencies.
   */
  public static getFieldsForDomainEvent(eventName: string): SmartPlaylistField[] | null {
    switch (eventName) {
      case 'SongPlayCountChanged':
        return ['playCount'];
      case 'SongFavoriteChanged':
        return ['isFavorite'];
      case 'SongAdded':
      case 'SongRemoved':
        // A structural change means ANY rule could be affected (e.g. matching title).
        // Returning null signifies "always affected".
        return null;
      default:
        // Metadata changed uses `isAffectedByMetadataChange` explicitly
        return [];
    }
  }
}
