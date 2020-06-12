import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { format } from 'date-fns';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'timeAccessed', ({ source }) => ({
  draw() {
    return {
      drawNode(row, { node }) {
        if (node.lstat) {
          row.add(
            format(node.lstat.atime, source.config.get('datetime.format')),
            {
              hl: fileHighlights.timeAccessed,
            },
          );
        } else {
          row.add('                 ');
        }
      },
    };
  },
}));
