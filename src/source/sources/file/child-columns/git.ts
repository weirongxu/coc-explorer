import commandExists from 'command-exists';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { GitFormat, gitManager, GitMixedStatus } from '../../../../gitManager';
import pathLib from 'path';
import { debounce } from '../../../../util';
import { fileHighlights } from '../fileSource';
import { onEvents, onCocGitStatusChange } from '../../../../events';
import { workspace } from 'coc.nvim';

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

    const reload = async (directory: string, reloadAll: boolean) => {
      await gitManager.reload(directory);
      const statuses = await gitManager.getStatuses(directory);

      const updatePaths: Set<string> = new Set();
      if (reloadAll) {
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
    };

    return {
      init() {
        subscriptions.push(
          onEvents(
            'BufWritePost',
            debounce(1000, async (bufnr) => {
              const fullpath = source.bufManager.getBufferNode(bufnr)?.fullpath;
              if (fullpath) {
                const filename = pathLib.basename(fullpath);
                const dirname = pathLib.dirname(fullpath);
                await reload(dirname, filename === '.gitignore');
              }
            }),
          ),
          onCocGitStatusChange(
            debounce(1000, async () => {
              await reload(workspace.cwd, false);
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
