import { getStatusIcons } from '../../../../git/config';
import { gitManager } from '../../../../git/manager';
import { GitFormat } from '../../../../git/types';
import { FilenameHighlight } from '../../../../highlight/filename';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn(
  'child',
  'git',
  ({ source, subscriptions }) => {
    const filenameHighlight = new FilenameHighlight(source.config);
    const icons = getStatusIcons(source.config);

    const getHighlight = (
      fullpath: string,
      staged: boolean,
      isDirectory: boolean,
    ) => {
      if (staged) {
        return fileHighlights.gitStaged;
      } else {
        return (
          filenameHighlight.getHighlight(fullpath, isDirectory, ['git']) ??
          fileHighlights.gitUnstaged
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
            const status = gitManager.getMixedStatus(
              node.fullpath,
              node.directory,
            );
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
              const hl = getHighlight(node.fullpath, staged, node.directory);
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
            const status = gitManager.getMixedStatus(
              node.fullpath,
              node.directory,
            );
            if (status) {
              showFormat(status.x, true);
              if (isLabeling) {
                row.add(' ');
              }
              showFormat(status.y, false);
              if (status.x === GitFormat.ignored) {
                source.locator.mark.remove('git', nodeIndex);
              } else {
                source.locator.mark.add('git', nodeIndex);
              }
            } else {
              source.locator.mark.remove('git', nodeIndex);
            }
          },
        };
      },
    };
  },
);
