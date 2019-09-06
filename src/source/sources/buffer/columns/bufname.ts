import { bufferColumnManager } from '../column-manager';

bufferColumnManager.registerColumn('bufname', {
  draw(row, item) {
    if (item.basename !== item.bufname) {
      row.add(item.bufname);
      row.add(' ');
    }
  },
});
