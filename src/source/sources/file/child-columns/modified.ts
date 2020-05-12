import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';
import { debounce } from '../../../../util';
import { argOptions } from '../../../../argOptions';

fileColumnRegistrar.registerColumn(
  'child',
  'modified',
  ({ source, subscriptions }) => {
    return {
      labelOnly: true,
      async init() {
        const position = await source.explorer.args.value(argOptions.position);
        if (position !== 'floating') {
          subscriptions.push(
            source.bufManager.onModified(
              debounce(500, async (fullpath) => {
                await source.renderPaths([fullpath]);
              }),
            ),
          );
        }
      },
      draw() {
        return {
          labelVisible: ({ node }) => source.bufManager.modified(node.fullpath),
          drawNode(row, { node, nodeIndex }) {
            let modified: boolean = false;
            if (node.directory) {
              if (!source.isExpanded(node)) {
                modified = source.bufManager.modifiedPrefix(node.fullpath);
              }
            } else {
              modified = source.bufManager.modified(node.fullpath);
            }
            row.add(modified ? '+' : '', {
              hl: fileHighlights.readonly,
            });
            modified
              ? source.addIndexes('modified', nodeIndex)
              : source.removeIndexes('modified', nodeIndex);
          },
        };
      },
    };
  },
);
