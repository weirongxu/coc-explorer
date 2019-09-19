import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnManager } from '../column-manager';
import { flattenChildren } from '../../../../util';
import { indentChars, topLevel } from './indent';
import { FileItem } from '../file-source';
import { workspace } from 'coc.nvim';

export const highlights = {
  directory: hlGroupManager.hlLinkGroupCommand('FileDirectory', 'PreProc'),
  nameActive: hlGroupManager.hlLinkGroupCommand('FileNameActive', 'String'),
};
hlGroupManager.register(highlights);

const nvim = workspace.nvim;

const minWidth = fileColumnManager.getColumnConfig<number>('filename.minWidth')!;
const maxWidth = fileColumnManager.getColumnConfig<number>('filename.maxWidth')!;

let fullTreeWidth = minWidth;

function indentWidth(item: FileItem) {
  if (fileColumnManager.columns.includes('indent') || fileColumnManager.columns.includes('indentLine')) {
    return indentChars.length * (item.level - (topLevel ? 0 : 1));
  } else {
    return 0;
  }
}

fileColumnManager.registerColumn('filename', (fileSource) => ({
  async beforeDraw() {
    const flatItems = flattenChildren(fileSource.items).filter((item) => !item.hidden || fileSource.showHiddenFiles);
    flatItems.forEach((item) => {
      if (item.data.indentWidth === undefined) {
        item.data.indentWidth = indentWidth(item);
      }
    });
    const treeWidths = await Promise.all(
      flatItems.map(
        async (item) => ((await nvim.call('strdisplaywidth', [item.name])) as number) + item.data.indentWidth,
      ),
    );
    fullTreeWidth = Math.min(maxWidth, Math.max(minWidth, Math.max(...treeWidths)));
    await Promise.all(
      flatItems.map(async (item) => {
        const filenameWidth = fullTreeWidth - item.data.indentWidth;
        item.data.truncatedName = await nvim.call('coc_explorer#truncate', [
          item.directory ? item.name + '/' : item.name,
          filenameWidth,
          '..',
        ]);
      }),
    );
  },
  draw(row, item) {
    if (item.directory) {
      row.add(item.data.truncatedName, highlights.directory);
    } else {
      row.add(item.data.truncatedName);
    }
    row.add(' ');
  },
}));
