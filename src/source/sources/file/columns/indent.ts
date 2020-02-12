import { fileColumnRegistrar } from '../file-column-registrar';
import { FileNode, fileHighlights } from '../file-source';
import { getEnableNerdfont } from '../../../../util';

export const getIndentChars = fileColumnRegistrar.getColumnConfig<string>('indent.chars');
export const getTopLevel = fileColumnRegistrar.getColumnConfig<string>('indent.topLevel');
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
  if (!node.parent && !getTopLevel) {
    return row;
  }
  if (node.nextSiblingNode === undefined) {
    row = '└';
  } else {
    row = '│';
  }
  let curNode = node.parent;
  while (curNode) {
    if (!curNode.parent && !getTopLevel) {
      break;
    }
    if (curNode.nextSiblingNode === undefined) {
      row = ' ' + row;
    } else {
      row = '│' + row;
    }
    curNode = curNode.parent;
  }
  return row;
}

fileColumnRegistrar.registerColumn('indent', () => ({
  draw(row, node) {
    if (getIndentLine()) {
      row.add(printIndentLine(node), { hl: fileHighlights.indentLine });
    } else {
      row.add(getIndentChars.repeat(node.level - (getTopLevel ? 0 : 1)));
    }
  },
}));
