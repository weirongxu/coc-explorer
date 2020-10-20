import { gitManager } from '../../../../git/manager';
import { GitFormat } from '../../../../git/types';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn(
  'child',
  'git',
  ({ source, subscriptions }) => {
    const getIconConf = (name: string) =>
      source.getColumnConfig<string>('git.icon.' + name)!;

    const statusIcons = {
      [GitFormat.mixed]: getIconConf('mixed'),
      [GitFormat.unmodified]: getIconConf('unmodified'),
      [GitFormat.modified]: getIconConf('modified'),
      [GitFormat.added]: getIconConf('added'),
      [GitFormat.deleted]: getIconConf('deleted'),
      [GitFormat.renamed]: getIconConf('renamed'),
      [GitFormat.copied]: getIconConf('copied'),
      [GitFormat.unmerged]: getIconConf('unmerged'),
      [GitFormat.untracked]: getIconConf('untracked'),
      [GitFormat.ignored]: getIconConf('ignored'),
    };

    return {
      init() {
        subscriptions.push(gitManager.bindFileSource(source, 'child'));
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
          drawNode(row, { node, nodeIndex }) {
            const showFormat = (f: GitFormat, staged: boolean) => {
              row.add(statusIcons[f], {
                hl: staged
                  ? fileHighlights.gitStaged
                  : fileHighlights.gitUnstaged,
              });
            };
            const status = gitManager.getMixedStatus(
              node.fullpath,
              node.directory,
            );
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
