import commandExists from 'command-exists';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { GitFormat, gitManager, GitMixedStatus } from '../../../../gitManager';
import pathLib from 'path';
import { debounce, delay, onError } from '../../../../util';
import { fileHighlights } from '../fileSource';
import { onEvent, internalEvents } from '../../../../events';
import { workspace } from 'coc.nvim';

fileColumnRegistrar.registerColumn(
  'child',
  'git',
  ({ source, subscriptions }) => {
    const showIgnored = source.getColumnConfig<boolean>('git.showIgnored')!;

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

    const reload = async (directory: string, isReloadAll: boolean) => {
      await gitManager.reload(directory, showIgnored);
      const statuses = await gitManager.getMixedStatuses(directory);

      const updatePaths: Set<string> = new Set();
      if (isReloadAll) {
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
          onEvent(
            'BufWritePost',
            debounce(1000, async (bufnr) => {
              const fullpath = source.bufManager.getBufferNode(bufnr)?.fullpath;
              if (fullpath) {
                const filename = pathLib.basename(fullpath);
                const dirname = pathLib.dirname(fullpath);
                const isReloadAll = filename === '.gitignore';
                await reload(dirname, isReloadAll);
              }
            }),
          ),
          internalEvents.on(
            'CocGitStatusChange',
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
      async load(node) {
        const folderPath =
          'isRoot' in node
            ? source.root
            : node.directory
            ? node.fullpath
            : pathLib.dirname(node.fullpath);
        delay(100)
          .then(async () => {
            await reload(folderPath, true);
          })
          .catch(onError);
      },
      async draw() {
        return {
          drawNode(row, { node, nodeIndex }) {
            const showFormat = (f: GitFormat, staged: boolean) => {
              row.add(statusIcons[f], {
                hl: staged
                  ? fileHighlights.gitStage
                  : fileHighlights.gitUnstage,
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
