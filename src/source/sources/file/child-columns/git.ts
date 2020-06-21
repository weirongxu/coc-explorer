import commandExists from 'command-exists';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { GitFormat, gitManager, GitMixedStatus } from '../../../../gitManager';
import pathLib from 'path';
import { debounce, delay } from '../../../../util';
import { fileHighlights } from '../fileSource';
import { onEvent, internalEvents } from '../../../../events';
import { workspace } from 'coc.nvim';
import { onError } from '../../../../logger';

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

    const reloadIgnore = async (directory: string) => {
      if (showIgnored) {
        await gitManager.reloadIgnore(directory);
      }
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
          onEvent(
            'BufWritePost',
            debounce(1000, async (bufnr) => {
              const fullpath = source.bufManager.getBufferNode(bufnr)?.fullpath;
              if (fullpath) {
                const filename = pathLib.basename(fullpath);
                const dirname = pathLib.dirname(fullpath);
                const isReloadIgnore = filename === '.gitignore';
                if (isReloadIgnore) {
                  await reloadIgnore(dirname);
                }
                await reload(dirname, isReloadIgnore);
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
        await reloadIgnore(folderPath);
        delay(100)
          .then(async () => {
            await reload(folderPath, true);
          })
          .catch(onError);
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
              source.addIndexing('git', nodeIndex);
            } else if (showIgnored && gitManager.shouldIgnore(node.fullpath)) {
              showFormat(statusIcons[GitFormat.unmodified], true);
              showFormat(statusIcons[GitFormat.ignored], true);
            } else {
              source.removeIndexing('git', nodeIndex);
            }
          },
        };
      },
    };
  },
);
