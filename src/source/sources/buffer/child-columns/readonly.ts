import { bufferColumnRegistrar } from '../bufferColumnRegistrar';
import { bufferHighlights } from '../bufferSource';

bufferColumnRegistrar.registerColumn('child', 'readonly', ({ source }) => ({
  labelOnly: true,
  labelVisible: (node) => node.readonly,
  drawLine(row, node) {
    if (node.readonly) {
      row.add(
        node.readonly ? (source.config.getEnableNerdfont ? '' : 'RO') : '',
        {
          hl: bufferHighlights.readonly,
        },
      );
    }
  },
}));
