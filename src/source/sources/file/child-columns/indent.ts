import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { FileNode, fileHighlights } from '../fileSource';
import { getEnableNerdfont } from '../../../../util';

export const getIndentChars = () => fileColumnRegistrar.getColumnConfig<string>('indent.chars');
const getIndentLine = () => {
  const indentLine = fileColumnRegistrar.getColumnConfig<boolean | undefined>('indent.indentLine');
  if (getEnableNerdfont() && indentLine === undefined) {
    return true;
  } else {
    return indentLine;
  }
};

/**
 * indentLine
 *
 * │
 * └
 */
function printIndentLine(node: FileNode) {
  let row = '';
  if (node.parent?.isRoot) {
    return row;
  }
  if (node.nextSiblingNode === undefined) {
    row = '└ ';
  } else {
    row = '│ ';
  }
  let curNode = node.parent;
  while (curNode) {
    if (curNode.parent?.isRoot) {
      break;
    }
    if (curNode.nextSiblingNode === undefined) {
      row = '  ' + row;
    } else {
      row = '│ ' + row;
    }
    curNode = curNode.parent;
  }
  return row;
}

fileColumnRegistrar.registerColumn('child', 'indent', () => ({
  draw(row, node) {
    if (getIndentLine()) {
      row.add(printIndentLine(node), { hl: fileHighlights.indentLine });
    } else {
      row.add(getIndentChars().repeat(node.level - 1));
    }
  },
}));
