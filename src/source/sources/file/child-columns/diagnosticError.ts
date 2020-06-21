import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { debounce } from '../../../../util';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn(
  'child',
  'diagnosticError',
  ({ source, subscriptions }) => {
    const cache = {
      errorMap: {} as Record<string, string>,
    };

    const load = () => {
      const diagnosticCountMax = source.config.get<number>(
        'file.diagnosticCountMax',
      )!;

      const errorMixedCount = source.diagnosticManager.getMixedError(
        source.root,
      );
      const localErrorMap: Record<string, string> = {};
      const prevErrorMap = cache.errorMap;
      const updatePaths: Set<string> = new Set();
      for (const [fullpath, count] of Object.entries(errorMixedCount)) {
        const ch = count > diagnosticCountMax ? '✗' : count.toString();
        localErrorMap[fullpath] = ch;

        if (fullpath in prevErrorMap) {
          if (prevErrorMap[fullpath] === ch) {
            continue;
          }
          delete prevErrorMap[fullpath];
          updatePaths.add(fullpath);
        } else {
          updatePaths.add(fullpath);
        }
      }
      for (const fullpath of Object.keys(prevErrorMap)) {
        updatePaths.add(fullpath);
      }
      cache.errorMap = localErrorMap;
      return updatePaths;
    };

    const reload = async () => {
      await source.renderPaths(load());
    };

    return {
      init() {
        subscriptions.push(
          source.diagnosticManager.onChange(debounce(1000, reload)),
        );
      },
      load() {
        load();
      },
      draw() {
        return {
          labelVisible: ({ node }) => node.fullpath in cache.errorMap,
          drawNode(row, { node, nodeIndex }) {
            if (node.fullpath in cache.errorMap) {
              if (node.directory && source.isExpanded(node)) {
                source.removeIndexing('diagnosticError', nodeIndex);
              } else {
                const count = cache.errorMap[node.fullpath];
                row.add(count, { hl: fileHighlights.diagnosticError });
                source.addIndexing('diagnosticError', nodeIndex);
              }
            } else {
              source.removeIndexing('diagnosticError', nodeIndex);
            }
          },
        };
      },
    };
  },
);
