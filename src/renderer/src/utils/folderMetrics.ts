export interface FolderMetrics {
  directSongCount: number;
  totalSongCount: number;
  directFolderCount: number;
  totalFolderCount: number;
}

export interface FolderBreadcrumbItem {
  label: string;
  path: string;
  isCurrent: boolean;
}

/**
 * Computes a Map of folderPath -> FolderMetrics in a single O(N) bottom-up pass over the tree.
 *
 * Invariant: - directSongCount: songs directly assigned to this folder - totalSongCount: direct
 * songs + all descendant subfolder songs - directFolderCount: direct child subfolders count -
 * totalFolderCount: count of all descendant subfolders in the entire branch
 */
export const computeFolderMetricsMap = (tree: MusicFolder[]): Map<string, FolderMetrics> => {
  const metricsMap = new Map<string, FolderMetrics>();

  if (!Array.isArray(tree) || tree.length === 0) return metricsMap;

  const traverse = (folder: MusicFolder): FolderMetrics => {
    const directSongCount = Array.isArray(folder.songIds) ? folder.songIds.length : 0;
    const directFolderCount = Array.isArray(folder.subFolders) ? folder.subFolders.length : 0;

    let descendantSongCount = 0;
    let descendantFolderCount = 0;

    if (directFolderCount > 0) {
      for (let i = 0; i < folder.subFolders.length; i++) {
        const childMetrics = traverse(folder.subFolders[i]);
        descendantSongCount += childMetrics.totalSongCount;
        descendantFolderCount += 1 + childMetrics.totalFolderCount;
      }
    }

    const metrics: FolderMetrics = {
      directSongCount,
      totalSongCount: directSongCount + descendantSongCount,
      directFolderCount,
      totalFolderCount: descendantFolderCount
    };

    metricsMap.set(folder.path, metrics);
    return metrics;
  };

  for (let i = 0; i < tree.length; i++) {
    traverse(tree[i]);
  }

  return metricsMap;
};

/**
 * Deterministically collects all song IDs in a folder branch on demand. Ordering: direct songs
 * first -> child 1 + descendants -> child 2 + descendants -> ... Guarantees no duplicate song IDs.
 */
export const getAllSongIds = (folder: MusicFolder): number[] => {
  if (!folder) return [];

  const seen = new Set<number>();
  const result: number[] = [];

  const collect = (node: MusicFolder) => {
    if (Array.isArray(node.songIds)) {
      for (let i = 0; i < node.songIds.length; i++) {
        const id = node.songIds[i];
        if (!seen.has(id)) {
          seen.add(id);
          result.push(id);
        }
      }
    }

    if (Array.isArray(node.subFolders)) {
      for (let i = 0; i < node.subFolders.length; i++) {
        collect(node.subFolders[i]);
      }
    }
  };

  collect(folder);
  return result;
};

/**
 * Parses a Windows or Unix folder path into an array of breadcrumb items with actual valid folder
 * paths.
 */
export const parseFolderBreadcrumbs = (folderPath: string): FolderBreadcrumbItem[] => {
  if (!folderPath) return [];

  const isWindows = folderPath.includes('\\');
  const separator = isWindows ? '\\' : '/';
  const parts = folderPath.split(/[\\/]/).filter(Boolean);

  if (parts.length === 0) return [];

  const breadcrumbs: FolderBreadcrumbItem[] = [];

  // Check if first part is a Windows drive (e.g., 'C:')
  const isDriveLetter = parts[0].includes(':');
  let currentPath = '';

  for (let i = 0; i < parts.length; i++) {
    if (i === 0) {
      if (isDriveLetter) {
        currentPath = parts[0] + (isWindows ? '\\' : '/');
      } else if (!isWindows && folderPath.startsWith('/')) {
        currentPath = '/' + parts[0];
      } else {
        currentPath = parts[0];
      }
    } else {
      if (currentPath.endsWith(separator)) {
        currentPath += parts[i];
      } else {
        currentPath += separator + parts[i];
      }
    }

    const isCurrent = i === parts.length - 1;
    breadcrumbs.push({
      label: parts[i],
      path: currentPath,
      isCurrent
    });
  }

  return breadcrumbs;
};
