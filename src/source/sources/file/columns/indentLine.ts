import { fileColumnManager } from '../column-manager';
import { FileItem } from '..';
import { hlGroupManager } from '../../../highlight-manager';
import { topLevel } from './indent';

const highlights = {
  line: hlGroupManager.hlLinkGroupCommand('IndentLine', 'Comment'),
};
hlGroupManager.register(highlights);

/**
 * indentLine
 *
 * ┊
 * ┊
 * └
 * │
 * │
 * └
 */
function indentLine(item: FileItem) {
  let row = '';
  if (!item.parent && !topLevel) {
    return row;
  }
  if (item.isLastInLevel) {
    row = '└ ';
  } else if (item.level % 2 === 0) {
    row = '┊ ';
  } else {
    row = '│ ';
  }
  let curItem = item.parent;
  while (curItem) {
    if (!curItem.parent && !topLevel) {
      break;
    }
    if (curItem.isLastInLevel) {
      row = '  ' + row;
    } else if (curItem.level % 2 === 0) {
      row = '┊ ' + row;
    } else {
      row = '│ ' + row;
    }
    curItem = curItem.parent;
  }
  return row;
}

fileColumnManager.registerColumn('indentLine', {
  draw(row, item) {
    row.add(indentLine(item), highlights.line.group);
  },
});
