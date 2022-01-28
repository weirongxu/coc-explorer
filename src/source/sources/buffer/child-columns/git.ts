import { getStatusIcons } from '../../../../git/config';
import { gitHighlights } from '../../../../git/highlights';
import { gitManager } from '../../../../git/manager';
import { GitFormat } from '../../../../git/types';
import { FilenameHighlight } from '../../../../highlight/filename';
import { bufferColumnRegistrar } from '../bufferColumnRegistrar';

bufferColumnRegistrar.registerColumn(
  'child',
  'git',
  ({ source, subscriptions }) => {
    const filenameHighlight = new FilenameHighlight(source.config);
    const icons = getStatusIcons(source.config);

    const getHighlight = (fullpath: string, staged: boolean) => {
      if (staged) {
        return gitHighlights.staged;
      } else {
        return (
          filenameHighlight.getHighlight(fullpath, false, ['git']) ??
          gitHighlights.unstaged
        );
      }
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
            const status = gitManager.getMixedStatus(node.fullpath, false);
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
              if (isLabeling) {
                row.add(' ');
              }
              showFormat(status.y, false);
              if (status.x === GitFormat.ignored) {
                source.locator.mark.remove('git', nodeIndex);
                source.locator.mark.remove('gitStaged', nodeIndex);
                source.locator.mark.remove('gitUnstaged', nodeIndex);
              } else {
                source.locator.mark.add('git', nodeIndex);
                if (status.x !== GitFormat.unmodified) {
                  source.locator.mark.add('gitStaged', nodeIndex);
                } else {
                  source.locator.mark.remove('gitStaged', nodeIndex);
                }
                if (status.y !== GitFormat.unmodified) {
                  source.locator.mark.add('gitUnstaged', nodeIndex);
                } else {
                  source.locator.mark.remove('gitUnstaged', nodeIndex);
                }
              }
            } else {
              source.locator.mark.remove('git', nodeIndex);
              source.locator.mark.remove('gitStaged', nodeIndex);
              source.locator.mark.remove('gitUnstaged', nodeIndex);
            }
          },
        };
      },
    };
  },
);
