import { fileColumnManager } from '../column-manager';

const chars = fileColumnManager.getColumnConfig<string>('readonly.chars');
const spacing = ' '.repeat(chars.length);

fileColumnManager.registerColumn('readonly', {
  draw(row, item) {
    row.add(item.readonly ? chars : spacing);
  },
});
