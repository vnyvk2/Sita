export class CollectionNamingStrategy {
  /**
   * Generates a duplicate name (e.g., "My Playlist (Copy)").
   * If there are already copies, it might do "(Copy 2)".
   * For now, we use a simple append.
   */
  public generateDuplicateName(originalName: string): string {
    return `${originalName} (Copy)`;
  }
}
