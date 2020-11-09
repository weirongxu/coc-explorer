import { getStatusIcons } from '../../../../git/config';
import { gitHighlights } from '../../../../git/highlights';
import { gitManager } from '../../../../git/manager';
import { GitFormat } from '../../../../git/types';
import { filenameHighlight } from '../../../highlights/filename';
import { bufferColumnRegistrar } from '../bufferColumnRegistrar';

bufferColumnRegistrar.registerColumn(
  'child',
  'git',
  ({ source, subscriptions }) => {
    const icons = getStatusIcons(source.config);

    const getHighlight = (fullpath: string, staged: boolean) => {
      return (
        filenameHighlight.getHighlight(fullpath, ['git']) ??
        (staged ? gitHighlights.gitStaged : gitHighlights.gitUnstaged)
      );
    };

    return {
      init() {
        subscriptions.push(gitManager.bindColumn(source));
      },
      async available() {
        return await gitManager.cmd.available();
      },
      async draw() {
        return {
          async labelVisible({ node }) {
            const status = gitManager.getMixedStatus(node.fullpath);
            if (!status) {
              return false;
            }
            return (
              status.x !== GitFormat.unmodified ||
              status.y !== GitFormat.unmodified
            );
          },
          drawNode(row, { node, nodeIndex, isLabeling }) {
            const showFormat = (f: GitFormat, staged: boolean) => {
              const hl = getHighlight(node.fullpath, staged);
              if (isLabeling) {
                row.add(`${icons[f].name}(${icons[f].icon})`, {
                  hl,
                });
              } else {
                row.add(icons[f].icon, {
                  hl,
                });
              }
            };
            const status = gitManager.getMixedStatus(node.fullpath, false);
            if (status) {
              showFormat(status.x, true);
              showFormat(status.y, false);
              if (status.x === GitFormat.ignored) {
                source.removeIndexing('git', nodeIndex);
              } else {
                source.addIndexing('git', nodeIndex);
              }
            } else {
              source.removeIndexing('git', nodeIndex);
            }
          },
        };
      },
    };
  },
);
