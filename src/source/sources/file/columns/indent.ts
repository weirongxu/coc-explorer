import { hlGroupManager } from '../../../highlight-manager';
import { enableNerdfont } from '../../../source';
import { fileColumnManager } from '../column-manager';
import { FileItem } from '../file-source';

export const indentChars = fileColumnManager.getColumnConfig<string>('indent.chars');
export const topLevel = fileColumnManager.getColumnConfig<string>('indent.topLevel');
let indentLine = fileColumnManager.getColumnConfig<boolean | undefined>('indent.indentLine');
if (enableNerdfont && indentLine === undefined) {
  indentLine = true;
}

const highlights = {
  line: hlGroupManager.hlLinkGroupCommand('IndentLine', 'Comment'),
};
hlGroupManager.register(highlights);

/**
 * indentLine
 *
 * │
 * └
 */
function printIndentLine(item: FileItem) {
  let row = '';
  if (!item.parent && !topLevel) {
    return row;
  }
  if (item.isLastInLevel) {
    row = '└ ';
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
    } else {
      row = '│ ' + row;
    }
    curItem = curItem.parent;
  }
  return row;
}

fileColumnManager.registerColumn('indent', {
  draw(row, item) {
    if (indentLine) {
      row.add(printIndentLine(item), highlights.line);
    } else {
      row.add(indentChars.repeat(item.level - (topLevel ? 0 : 1)));
    }
  },
});
