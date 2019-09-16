import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnManager } from '../column-manager';
import { truncate } from '../../../../util';
import { indentChars, topLevel } from './indent';
import { FileItem, expandStore } from '../file-source';

export const highlights = {
  directory: hlGroupManager.hlLinkGroupCommand('FileDirectory', 'PreProc'),
  nameActive: hlGroupManager.hlLinkGroupCommand('FileNameActive', 'String'),
};
hlGroupManager.register(highlights);

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
  beforeDraw() {
    const maxTreeWidth = fileSource.items
      .reduce<FileItem[]>((flatItems, item) => {
        flatItems.push(item);
        if (item.directory && expandStore.isExpanded(item.fullpath) && item.children) {
          flatItems.push(...item.children);
        }
        return flatItems;
      }, [])
      .filter((item) => !item.hidden || fileSource.showHiddenFiles)
      .map((item) => item.name.length + indentWidth(item))
      .reduce((width, max) => (width > max ? width : max), 0);
    fullTreeWidth = Math.min(maxWidth, Math.max(minWidth, maxTreeWidth));
  },
  draw(row, item) {
    const filenameWidth = fullTreeWidth - indentWidth(item);
    if (item.directory) {
      row.add(truncate(item.name + '/', filenameWidth, 'end'), highlights.directory.group);
    } else {
      row.add(truncate(item.name, filenameWidth, 'end'));
    }
    row.add(' ');
  },
}));
