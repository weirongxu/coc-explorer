import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';
import { debounce } from '../../../../util';

fileColumnRegistrar.registerColumn(
  'child',
  'modified',
  ({ source, subscriptions }) => {
    return {
      async init() {
        if (!source.explorer.isFloating) {
          subscriptions.push(
            source.bufManager.onModified(
              debounce(500, async (fullpath) => {
                await source.view.renderPaths([fullpath]);
              }),
            ),
          );
        }
      },
      draw() {
        return {
          labelOnly: true,
          labelVisible: ({ node }) => source.bufManager.modified(node.fullpath),
          drawNode(row, { node, nodeIndex }) {
            let modified: boolean = false;
            if (node.directory) {
              if (!source.view.isExpanded(node)) {
                modified = source.bufManager.modifiedPrefix(node.fullpath);
              }
            } else {
              modified = source.bufManager.modified(node.fullpath);
            }
            row.add(modified ? '+' : '', {
              hl: fileHighlights.readonly,
            });
            modified
              ? source.locator.mark.add('modified', nodeIndex)
              : source.locator.mark.remove('modified', nodeIndex);
          },
        };
      },
    };
  },
);
