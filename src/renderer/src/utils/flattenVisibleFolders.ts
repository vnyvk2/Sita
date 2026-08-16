export interface FlattenedFolderItem {
  folder: MusicFolder;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

/**
 * Pure function to flatten a hierarchical MusicFolder tree into a visible 1D array based on the
 * current set of expanded folder paths.
 *
 * Invariant: A node's subfolders are included if and only if the node is present in
 * `expandedPaths`. Pre-sorted hierarchy from getMusicFolderData is preserved during traversal.
 */
export const flattenVisibleFolders = (
  tree: MusicFolder[],
  expandedPaths: Set<string>,
  depth = 0
): FlattenedFolderItem[] => {
  if (!Array.isArray(tree) || tree.length === 0) return [];

  const result: FlattenedFolderItem[] = [];

  for (let i = 0; i < tree.length; i++) {
    const folder = tree[i];
    const hasChildren = Array.isArray(folder.subFolders) && folder.subFolders.length > 0;
    const isExpanded = hasChildren && expandedPaths.has(folder.path);

    result.push({
      folder,
      depth,
      hasChildren,
      isExpanded
    });

    if (isExpanded) {
      const subItems = flattenVisibleFolders(folder.subFolders, expandedPaths, depth + 1);
      for (let j = 0; j < subItems.length; j++) {
        result.push(subItems[j]);
      }
    }
  }

  return result;
};

export default flattenVisibleFolders;
