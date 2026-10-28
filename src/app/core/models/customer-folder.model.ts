/** A folder of the customer's storage, as returned by `GET /customer-folders`. Folders nest through `parentId`; the ids are numbers. */
export interface CustomerFolder {
  id: number;
  name: string;
  /** The folder this one lives in; `null` for a top-level folder. */
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /customer-folders` - every folder in one flat list (no paging), `total` is its length. */
export interface CustomerFoldersResponse {
  items: CustomerFolder[];
  total: number;
}

/** Body of `POST /customer-folders`; `parentId: null` creates a top-level folder. */
export interface CreateCustomerFolderRequest {
  name: string;
  parentId: number | null;
}

/** The folder name limit the form enforces (the backend decides the real one and answers 400 above it). */
export const CUSTOMER_FOLDER_NAME_MAX_LENGTH = 255;

/** A folder with the folders directly inside it. */
export interface FolderNode {
  folder: CustomerFolder;
  children: FolderNode[];
}

/** One line of the folder tree as shown: how deep it is and whether it can be opened. */
export interface FolderRow {
  folder: CustomerFolder;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

function byName(a: CustomerFolder, b: CustomerFolder): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) || a.id - b.id;
}

/**
 * Turns the flat list into a nested tree, every level sorted by name. A
 * folder whose parent isn't in the list (or that sits in a parent loop) is
 * not dropped: it is shown at the top level, so nothing the backend returns
 * can disappear from the screen.
 */
export function buildFolderTree(folders: readonly CustomerFolder[]): FolderNode[] {
  const ids = new Set(folders.map((folder) => folder.id));
  const childrenOf = new Map<number, CustomerFolder[]>();
  const roots: CustomerFolder[] = [];

  for (const folder of folders) {
    if (folder.parentId !== null && ids.has(folder.parentId) && folder.parentId !== folder.id) {
      const siblings = childrenOf.get(folder.parentId) ?? [];
      siblings.push(folder);
      childrenOf.set(folder.parentId, siblings);
    } else {
      roots.push(folder);
    }
  }

  const placed = new Set<number>();
  const build = (folder: CustomerFolder): FolderNode => {
    placed.add(folder.id);
    const children = (childrenOf.get(folder.id) ?? []).filter((child) => !placed.has(child.id)).sort(byName);
    return { folder, children: children.map(build) };
  };

  const tree = roots.sort(byName).map(build);
  // Folders left over sit in a parent loop (a -> b -> a): break it by showing the first of each loop at the top level.
  for (const folder of [...folders].sort(byName)) {
    if (!placed.has(folder.id)) {
      tree.push(build(folder));
    }
  }
  return tree;
}

/** The rows to draw: the whole tree depth-first, skipping what is inside a closed folder. */
export function visibleFolderRows(tree: readonly FolderNode[], expandedIds: ReadonlySet<number>): FolderRow[] {
  const rows: FolderRow[] = [];
  const walk = (nodes: readonly FolderNode[], depth: number) => {
    for (const node of nodes) {
      const expanded = expandedIds.has(node.folder.id);
      rows.push({ folder: node.folder, depth, hasChildren: node.children.length > 0, expanded });
      if (expanded) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(tree, 0);
  return rows;
}

/** Every folder, depth-first with its depth - for a "parent folder" picker where nothing may be hidden. */
export function allFolderRows(tree: readonly FolderNode[]): FolderRow[] {
  const rows: FolderRow[] = [];
  const walk = (nodes: readonly FolderNode[], depth: number) => {
    for (const node of nodes) {
      rows.push({ folder: node.folder, depth, hasChildren: node.children.length > 0, expanded: true });
      walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return rows;
}

/** The folders from the top level down to `id` (inclusive); empty if `id` isn't in the list. */
export function folderPath(id: number | null, folders: readonly CustomerFolder[]): CustomerFolder[] {
  if (id === null) {
    return [];
  }
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: CustomerFolder[] = [];
  const seen = new Set<number>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return byId.has(id) ? path : [];
}
