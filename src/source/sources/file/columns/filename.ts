import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnRegistrar } from '../file-column-registrar';
import { indentChars, topLevel } from './indent';
import { FileNode, FileSource } from '../file-source';
import { workspace } from 'coc.nvim';
import { fsReadlink } from '../../../../util';

export const highlights = {
  directory: hlGroupManager.linkGroup('FileDirectory', 'Directory'),
  linkTarget: hlGroupManager.linkGroup('FileLinkTarget', 'Comment'),
};

const nvim = workspace.nvim;

const width = fileColumnRegistrar.getColumnConfig<number>('filename.width')!;

const attrSymbol = Symbol('filename-attr');
type FilenameAttr = {
  indentWidth: number;
  truncatedName?: string;
  truncatedLinkTarget?: string;
};

function getFilenameAttr(fileSource: FileSource, node: FileNode) {
  if (!Reflect.has(node, attrSymbol)) {
    Reflect.set(node, attrSymbol, {
      indentWidth: indentWidth(fileSource, node),
    } as FilenameAttr);
  }
  return Reflect.get(node, attrSymbol) as FilenameAttr;
}

function indentWidth(fileSource: FileSource, node: FileNode) {
  if (fileSource.columnManager.columnNames.includes('indent') || fileSource.columnManager.columnNames.includes('indentLine')) {
    return indentChars.length * (node.level - (topLevel ? 0 : 1));
  } else {
    return 0;
  }
}

const truncateCache: Map<string, [string, string]> = new Map();
async function loadTruncateNodes(
  fileSource: FileSource,
  fullTreeWidth: number,
  flatNodes: FileNode[],
) {
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
      const key = [node.level, name, linkTarget].join('-');
      if (!truncateCache.has(key)) {
        const remainWidth = fullTreeWidth - getFilenameAttr(fileSource, node).indentWidth;
        truncateCache.set(
          key,
          await nvim.call('coc_explorer#truncate', [name, linkTarget, remainWidth, '..']),
        );
      }
      const cache = truncateCache.get(key)!;
      getFilenameAttr(fileSource, node).truncatedName = cache[0];
      getFilenameAttr(fileSource, node).truncatedLinkTarget = cache[1];
    }),
  );
}

fileColumnRegistrar.registerColumn('filename', (fileSource) => ({
  async beforeDraw(nodes) {
    await loadTruncateNodes(fileSource, width, nodes);
  },
  draw(row, node) {
    const attr = getFilenameAttr(fileSource, node);
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
