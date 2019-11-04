import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnManager } from '../column-manager';
import { indentChars, topLevel } from './indent';
import { FileNode } from '../file-source';
import { workspace } from 'coc.nvim';
import { fsReadlink } from '../../../../util';

export const highlights = {
  directory: hlGroupManager.hlLinkGroupCommand('FileDirectory', 'Directory'),
  linkTarget: hlGroupManager.hlLinkGroupCommand('FileLinkTarget', 'Comment'),
};

const nvim = workspace.nvim;

const width = fileColumnManager.getColumnConfig<number>('filename.width')!;

const attrSymbol = Symbol('filename-attr');
type FilenameAttr = {
  indentWidth: number;
  truncatedName?: string;
  truncatedLinkTarget?: string;
};

function getFilenameAttr(node: FileNode) {
  if (!Reflect.has(node, attrSymbol)) {
    Reflect.set(node, attrSymbol, {
      indentWidth: indentWidth(node),
    } as FilenameAttr);
  }
  return Reflect.get(node, attrSymbol) as FilenameAttr;
}

function indentWidth(node: FileNode) {
  if (fileColumnManager.columns.includes('indent') || fileColumnManager.columns.includes('indentLine')) {
    return indentChars.length * (node.level - (topLevel ? 0 : 1));
  } else {
    return 0;
  }
}

const truncateCache: Map<[number, string, string], [string, string]> = new Map();
async function loadTruncateNodes(fullTreeWidth: number, flatNodes: FileNode[]) {
  await Promise.all(
    flatNodes.map(async (node) => {
      let name = node.name;
      if (node.directory) {
        name += '/';
      }
      const linkTarget = node.symbolicLink
        ? await fsReadlink(node.fullpath)
            .then((link) => {
              return ' → ' + link;
            })
            .catch(() => '')
        : '';
      const key = [node.level, name, linkTarget] as [number, string, string];
      if (!truncateCache.has(key)) {
        const remainWidth = fullTreeWidth - getFilenameAttr(node).indentWidth;
        truncateCache.set(key, await nvim.call('coc_explorer#truncate', [name, linkTarget, remainWidth, '..']));
      }
      const cache = truncateCache.get(key)!;
      getFilenameAttr(node).truncatedName = cache[0];
      getFilenameAttr(node).truncatedLinkTarget = cache[1];
    }),
  );
}

fileColumnManager.registerColumn('filename', (fileSource) => ({
  async beforeDraw(nodes) {
    await loadTruncateNodes(width, nodes);
  },
  draw(row, node) {
    const attr = getFilenameAttr(node);
    if (node.directory) {
      row.add(attr.truncatedName!, highlights.directory);
      row.add(attr.truncatedLinkTarget!, highlights.linkTarget);
    } else {
      row.add(attr.truncatedName!);
      row.add(attr.truncatedLinkTarget!, highlights.linkTarget);
    }
    row.add(' ');
  },
}));
