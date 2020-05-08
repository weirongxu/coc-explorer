import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { format } from 'date-fns';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'timeCreated', ({ source }) => ({
  draw() {
    return {
      drawNode(row, { node }) {
        if (node.lstat) {
          row.add(format(node.lstat.ctime, source.config.datetimeFormat), {
            hl: fileHighlights.timeCreated,
          });
        }
      },
    };
  },
}));
