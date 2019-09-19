import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnManager } from '../column-manager';
import { indentChars, topLevel } from './indent';
import { FileItem, expandStore } from '../file-source';
import { workspace } from 'coc.nvim';

export const highlights = {
  directory: hlGroupManager.hlLinkGroupCommand('FileDirectory', 'PreProc'),
  nameActive: hlGroupManager.hlLinkGroupCommand('FileNameActive', 'String'),
};
hlGroupManager.register(highlights);

const nvim = workspace.nvim;

const minWidth = fileColumnManager.getColumnConfig<number>('filename.minWidth')!;
const maxWidth = fileColumnManager.getColumnConfig<number>('filename.maxWidth')!;

function indentWidth(item: FileItem) {
  if (fileColumnManager.columns.includes('indent') || fileColumnManager.columns.includes('indentLine')) {
    return indentChars.length * (item.level - (topLevel ? 0 : 1));
  } else {
    return 0;
  }
}

export function flattenChildren(items: FileItem[]) {
  const stack = [...items];
  const res = [];
  while (stack.length) {
    const item = stack.shift()!;
    res.push(item);
    if (item.children && Array.isArray(item.children) && expandStore.isExpanded(item.fullpath)) {
      stack.unshift(...item.children);
    }
  }
  return res;
}

const truncateCache: Map<[string, number], string> = new Map();
async function loadTruncateItems(fullTreeWidth: number, flatItems: FileItem[]) {
  await Promise.all(
    flatItems.map(async (item) => {
      const key = [item.uid, item.level] as [string, number];
      if (!truncateCache.has(key)) {
        const filenameWidth = fullTreeWidth - item.data.filename.indentWidth;
        truncateCache.set(
          key,
          await nvim.call('coc_explorer#truncate', [item.directory ? item.name + '/' : item.name, filenameWidth, '..']),
        );
      }
      item.data.filename.truncatedName = truncateCache.get(key);
    }),
  );
}

const usedWidthCache: Map<[string, number], string> = new Map();
async function loadUsedWidth(flatItems: FileItem[]) {
  await Promise.all(
    flatItems.map(async (item) => {
      const key = [item.uid, item.level] as [string, number];
      if (!usedWidthCache.has(key)) {
        usedWidthCache.set(
          key,
          ((await nvim.call('strdisplaywidth', [item.name])) as number) + item.data.filename.indentWidth,
        );
      }
      item.data.filename.usedWidth = usedWidthCache.get(key);
    }),
  );
}

fileColumnManager.registerColumn('filename', (fileSource) => ({
  async beforeDraw() {
    const flatItems = flattenChildren(fileSource.items).filter((item) => !item.hidden || fileSource.showHiddenFiles);
    flatItems.forEach((item) => {
      item.data.filename = {};
      item.data.filename.indentWidth = indentWidth(item);
    });
    await loadUsedWidth(flatItems);
    const fullTreeWidth = Math.min(
      maxWidth,
      Math.max(minWidth, Math.max(...flatItems.map((item) => item.data.filename.usedWidth))),
    );
    await loadTruncateItems(fullTreeWidth, flatItems);
  },
  draw(row, item) {
    if (item.directory) {
      row.add(item.data.filename.truncatedName, highlights.directory);
    } else {
      row.add(item.data.filename.truncatedName);
    }
    row.add(' ');
  },
}));
