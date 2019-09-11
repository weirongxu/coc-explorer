import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnManager } from '../column-manager';
import { truncate } from '../../../../util';
import { indentChars, topLevel } from './indent';
import { FileItem, expandStore } from '..';

export const highlights = {
  directory: hlGroupManager.hlLinkGroupCommand('FileDirectory', 'PreProc'),
  nameActive: hlGroupManager.hlLinkGroupCommand('FileNameActive', 'String'),
};
hlGroupManager.register(highlights);

const minWidth = fileColumnManager.getColumnConfig<number>('filename.minWidth')!;
const maxWidth = fileColumnManager.getColumnConfig<number>('filename.maxWidth')!;

let realFilenameWidth = minWidth;

function indentWidth(item: FileItem) {
  return indentChars.length * (item.level - (topLevel ? 0 : 1));
}

fileColumnManager.registerColumn('filename', (source) => ({
  beforeDraw() {
    const maxFilenameWidth = source.items
      .reduce<FileItem[]>((flatItems, item) => {
        flatItems.push(item);
        if (item.directory && expandStore.isExpanded(item.fullpath) && item.children) {
          flatItems.push(...item.children);
        }
        return flatItems;
      }, [])
      .filter((item) => !item.hidden || source.showHiddenFiles)
      .map((item) => item.name.length + indentWidth(item))
      .reduce((width, max) => (width > max ? width : max), 0);
    realFilenameWidth = Math.min(maxWidth, Math.max(minWidth, maxFilenameWidth));
  },
  draw(row, item) {
    const width = realFilenameWidth - indentWidth(item);
    if (item.directory) {
      row.add(truncate(item.name + '/', width, 'end'), highlights.directory.group);
    } else if (source.currentFileItem === item) {
      row.add(truncate(item.name, width, 'end'), highlights.nameActive.group);
    } else {
      row.add(truncate(item.name, width, 'end'));
    }
    row.add(' ');
  },
}));
