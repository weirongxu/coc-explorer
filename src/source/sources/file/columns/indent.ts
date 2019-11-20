import { hlGroupManager } from '../../../highlight-manager';
import { enableNerdfont } from '../../../source';
import { fileColumnRegistrar } from '../file-column-registrar';
import { FileNode } from '../file-source';

export const indentChars = fileColumnRegistrar.getColumnConfig<string>('indent.chars');
export const topLevel = fileColumnRegistrar.getColumnConfig<string>('indent.topLevel');
let indentLine = fileColumnRegistrar.getColumnConfig<boolean | undefined>('indent.indentLine');
if (enableNerdfont && indentLine === undefined) {
  indentLine = true;
}

const highlights = {
  line: hlGroupManager.linkGroup('IndentLine', 'Comment'),
};

/**
 * indentLine
 *
 * │
 * └
 */
function printIndentLine(node: FileNode) {
  let row = '';
  if (!node.parent && !topLevel) {
    return row;
  }
  if (node.isLastInLevel) {
    row = '└ ';
  } else {
    row = '│ ';
  }
  let curNode = node.parent;
  while (curNode) {
    if (!curNode.parent && !topLevel) {
      break;
    }
    if (curNode.isLastInLevel) {
      row = '  ' + row;
    } else {
      row = '│ ' + row;
    }
    curNode = curNode.parent;
  }
  return row;
}

fileColumnRegistrar.registerColumn('indent', () => ({
  draw(row, node) {
    if (indentLine) {
      row.add(printIndentLine(node), highlights.line);
    } else {
      row.add(indentChars.repeat(node.level - (topLevel ? 0 : 1)));
    }
  },
}));
