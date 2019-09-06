import { fileColumnManager } from '../column-manager';

export const indentChars = fileColumnManager.getColumnConfig<string>('indent.chars');
export const topLevel = fileColumnManager.getColumnConfig<string>('indent.topLevel');

fileColumnManager.registerColumn('indent', {
  draw(row, item) {
    row.add(indentChars.repeat(item.level - (topLevel ? 0 : 1)));
  },
});
