import { fileColumnRegistrar } from '../file-column-registrar';
import { fileHighlights } from '../file-source';
import { DrawFlexible } from '../../../view-builder';

fileColumnRegistrar.registerColumn('filename', () => ({
  async draw(row, node) {
    const filenameFlexible = fileColumnRegistrar.getColumnConfig<DrawFlexible>(
      'filename.flexible',
    )!;
    if (node.directory) {
      await row.flexible(filenameFlexible, () => {
        row.add(node.name, {
          hl: fileHighlights.directory,
          unicode: true,
        });
      });
    } else {
      await row.flexible(filenameFlexible, () => {
        row.add(node.name, { unicode: true });
      });
    }
  },
}));
