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

function getFilenameAttr(source: FileSource, node: FileNode) {
  if (!Reflect.has(node, attrSymbol)) {
    Reflect.set(node, attrSymbol, {
      indentWidth: indentWidth(source, node),
    } as FilenameAttr);
  }
  return Reflect.get(node, attrSymbol) as FilenameAttr;
}

function indentWidth(source: FileSource, node: FileNode) {
  if (source.columnManager.columnNames.includes('indent') || source.columnManager.columnNames.includes('indentLine')) {
    return indentChars.length * (node.level - (topLevel ? 0 : 1));
  } else {
    return 0;
  }
}

const truncateCache: Map<string, [string, string]> = new Map();
async function loadTruncateNodes(
  source: FileSource,
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
        const remainWidth = fullTreeWidth - getFilenameAttr(source, node).indentWidth;
        truncateCache.set(
          key,
          await nvim.call('coc_explorer#truncate', [name, linkTarget, remainWidth, '..']),
        );
      }
      const cache = truncateCache.get(key)!;
      getFilenameAttr(source, node).truncatedName = cache[0];
      getFilenameAttr(source, node).truncatedLinkTarget = cache[1];
    }),
  );
}

fileColumnRegistrar.registerColumn('filename', (source) => ({
  async beforeDraw(nodes) {
    await loadTruncateNodes(source, width, nodes);
  },
  draw(row, node) {
    const attr = getFilenameAttr(source, node);
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
