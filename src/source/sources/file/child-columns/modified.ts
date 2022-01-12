import { buffer, debounceTime, Subject } from 'rxjs';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn(
  'child',
  'modified',
  ({ source, subscriptions }) => {
    return {
      async init() {
        if (!source.explorer.isFloating) {
          const sub = new Subject<string>();
          sub
            .pipe(buffer(sub.pipe(debounceTime(500))))
            .subscribe(async (fullpaths) => {
              await source.view.renderPaths(fullpaths);
            });
          subscriptions.push(
            source.bufManager.onModified((fullpath) => sub.next(fullpath)),
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
