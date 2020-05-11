import commandExists from 'command-exists';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { GitFormat, gitManager, GitMixedStatus } from '../../../../gitManager';
import pathLib from 'path';
import { debounce } from '../../../../util';
import { fileHighlights } from '../fileSource';
import { onEvents } from '../../../../events';

fileColumnRegistrar.registerColumn(
  'child',
  'git',
  ({ source, subscriptions }) => {
    let prevStatuses = {} as Record<string, GitMixedStatus>;

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

    const statusEqual = (a: GitMixedStatus, b: GitMixedStatus) => {
      return a.x === b.x && a.y === b.y;
    };

    return {
      init() {
        subscriptions.push(
          onEvents(
            'BufWritePost',
            debounce(1000, async (bufnr) => {
              const bufinfo = await source.nvim.call('getbufinfo', [bufnr]);
              if (bufinfo[0] && bufinfo[0].name) {
                const name: string = bufinfo[0].name;
                const filename = pathLib.basename(name);
                const path = pathLib.dirname(name);
                await gitManager.reload(path);
                const statuses = await gitManager.getStatuses(path);

                const updatePaths: Set<string> = new Set();
                if (filename === '.gitignore') {
                  for (const fullpath of Object.keys(statuses)) {
                    updatePaths.add(fullpath);
                  }
                  for (const fullpath of Object.keys(prevStatuses)) {
                    updatePaths.add(fullpath);
                  }
                } else {
                  for (const [fullpath, status] of Object.entries(statuses)) {
                    if (fullpath in prevStatuses) {
                      if (statusEqual(prevStatuses[fullpath], status)) {
                        continue;
                      }
                      delete prevStatuses[fullpath];
                    }
                    updatePaths.add(fullpath);
                  }
                  for (const fullpath of Object.keys(prevStatuses)) {
                    updatePaths.add(fullpath);
                  }
                }
                await source.renderPaths(updatePaths);
                prevStatuses = statuses;
              }
            }),
          ),
        );
      },
      async available() {
        try {
          await commandExists('git');
          return true;
        } catch (e) {
          return false;
        }
      },
      async reload(node) {
        const folderPath =
          'isRoot' in node
            ? source.root
            : node.directory
            ? node.fullpath
            : pathLib.dirname(node.fullpath);
        await gitManager.reload(folderPath);
        prevStatuses = await gitManager.getStatuses(folderPath);
      },
      draw() {
        return {
          drawNode(row, { node, nodeIndex }) {
            const showFormat = (f: string, staged: boolean) => {
              row.add(f, {
                hl: staged
                  ? fileHighlights.gitStage
                  : fileHighlights.gitUnstage,
              });
            };
            const status = gitManager.getStatus(node.fullpath);
            if (status) {
              showFormat(statusIcons[status.x], true);
              showFormat(statusIcons[status.y], false);
              source.addIndexes('git', nodeIndex);
            } else {
              source.removeIndexes('git', nodeIndex);
            }
          },
        };
      },
    };
  },
);
