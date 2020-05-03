import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'readonly', ({ source }) => ({
  labelOnly: true,
  labelVisible: (node) => node.readonly,
  drawLine(row, node) {
    if (node.readonly) {
      row.add(
        node.readonly ? (source.config.getEnableNerdfont ? '' : 'RO') : '',
        {
          hl: fileHighlights.readonly,
        },
      );
    }
  },
}));
