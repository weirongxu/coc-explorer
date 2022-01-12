import { debounce } from '../../../../util';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn(
  'child',
  'modified',
  ({ source, subscriptions }) => {
    return {
      async init() {
        if (!source.explorer.isFloating) {
          // modified event
          const modifiedQueue = new Set<string>();
          const modifiedRender = debounce(500, async () => {
            const fullpaths = [...modifiedQueue];
            modifiedQueue.clear();
            await source.view.renderPaths(fullpaths);
          });
          subscriptions.push(
            source.bufManager.onModified(async (fullpath) => {
              modifiedQueue.add(fullpath);
              modifiedRender();
            }),
          );
        }
      },
      draw() {
        return {
          labelOnly: true,
          labelVisible: ({ node }) =>
            source.bufManager.modified(node.fullpath, {
              directory: node.directory,
            }),
          drawNode(row, { node, nodeIndex }) {
            const modified: boolean = source.bufManager.modified(
              node.fullpath,
              {
                directory: node.directory && !source.view.isExpanded(node),
              },
            );
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
