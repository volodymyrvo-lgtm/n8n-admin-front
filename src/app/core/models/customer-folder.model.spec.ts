import {
  allFolderRows,
  buildFolderTree,
  CustomerFolder,
  folderPath,
  visibleFolderRows,
} from './customer-folder.model';

function folder(id: number, name: string, parentId: number | null): CustomerFolder {
  return { id, name, parentId, createdAt: '2026-10-23T11:01:16.934Z', updatedAt: '2026-10-23T11:01:16.934Z' };
}

const FOLDERS = [
  folder(3, 'Summer', 1),
  folder(1, 'Campaigns', null),
  folder(2, 'Archive', null),
  folder(4, 'Az', 3),
  folder(5, 'Winter', 1),
];

describe('customer folder model', () => {
  describe('buildFolderTree', () => {
    it('nests folders under their parent and sorts every level by name', () => {
      const tree = buildFolderTree(FOLDERS);

      expect(tree.map((node) => node.folder.name)).toEqual(['Archive', 'Campaigns']);
      const campaigns = tree[1];
      expect(campaigns.children.map((node) => node.folder.name)).toEqual(['Summer', 'Winter']);
      expect(campaigns.children[0].children.map((node) => node.folder.name)).toEqual(['Az']);
    });

    it('sorts numbers naturally and ignores case', () => {
      const tree = buildFolderTree([folder(1, 'b', null), folder(2, 'folder 10', null), folder(3, 'Folder 2', null), folder(4, 'A', null)]);

      expect(tree.map((node) => node.folder.name)).toEqual(['A', 'b', 'Folder 2', 'folder 10']);
    });

    it('shows a folder whose parent is missing, or that is its own parent, at the top level', () => {
      const tree = buildFolderTree([folder(1, 'Orphan', 99), folder(2, 'Self', 2)]);

      expect(tree.map((node) => node.folder.id)).toEqual([1, 2]);
    });

    it('does not lose or repeat folders that sit in a parent loop', () => {
      const tree = buildFolderTree([folder(1, 'A', 2), folder(2, 'B', 1), folder(3, 'C', null)]);
      const ids: number[] = [];
      const walk = (nodes: typeof tree) => nodes.forEach((node) => (ids.push(node.folder.id), walk(node.children)));
      walk(tree);

      expect(ids.sort()).toEqual([1, 2, 3]);
    });

    it('returns an empty tree for no folders', () => {
      expect(buildFolderTree([])).toEqual([]);
    });
  });

  describe('visibleFolderRows', () => {
    it('lists only the top level when nothing is expanded', () => {
      const rows = visibleFolderRows(buildFolderTree(FOLDERS), new Set());

      expect(rows.map((row) => [row.folder.name, row.depth, row.hasChildren, row.expanded])).toEqual([
        ['Archive', 0, false, false],
        ['Campaigns', 0, true, false],
      ]);
    });

    it('lists the children of expanded folders right below them, with their depth', () => {
      const rows = visibleFolderRows(buildFolderTree(FOLDERS), new Set([1, 3]));

      expect(rows.map((row) => [row.folder.name, row.depth])).toEqual([
        ['Archive', 0],
        ['Campaigns', 0],
        ['Summer', 1],
        ['Az', 2],
        ['Winter', 1],
      ]);
    });

    it('hides the contents of a closed folder even if a deeper one is marked expanded', () => {
      const rows = visibleFolderRows(buildFolderTree(FOLDERS), new Set([3]));

      expect(rows.map((row) => row.folder.name)).toEqual(['Archive', 'Campaigns']);
    });
  });

  describe('allFolderRows', () => {
    it('lists every folder depth-first regardless of expansion', () => {
      const rows = allFolderRows(buildFolderTree(FOLDERS));

      expect(rows.map((row) => [row.folder.name, row.depth])).toEqual([
        ['Archive', 0],
        ['Campaigns', 0],
        ['Summer', 1],
        ['Az', 2],
        ['Winter', 1],
      ]);
    });
  });

  describe('folderPath', () => {
    it('returns the folders from the top down to the one asked for', () => {
      expect(folderPath(4, FOLDERS).map((item) => item.name)).toEqual(['Campaigns', 'Summer', 'Az']);
    });

    it('returns an empty path for null or an unknown id', () => {
      expect(folderPath(null, FOLDERS)).toEqual([]);
      expect(folderPath(404, FOLDERS)).toEqual([]);
    });

    it('stops at a parent loop instead of hanging', () => {
      const path = folderPath(1, [folder(1, 'A', 2), folder(2, 'B', 1)]);

      expect(path.map((item) => item.id)).toEqual([2, 1]);
    });
  });
});
