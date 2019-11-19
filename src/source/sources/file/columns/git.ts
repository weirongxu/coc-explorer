import commandExists from 'command-exists';
import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnRegistrar } from '../file-column-registrar';
import { GitFormat, gitManager, GitMixedStatus } from '../../../../git-manager';
import pathLib from 'path';
import { events } from 'coc.nvim';
import { debounce } from '../../../../util';
import { FileNode } from '../file-source';

const highlights = {
  stage: hlGroupManager.linkGroup('FileGitStage', 'Comment'),
  unstage: hlGroupManager.linkGroup('FileGitUnstage', 'Operator'),
};

const getIconConf = (name: string) => {
  return fileColumnRegistrar.getColumnConfig<string>('git.icon.' + name)!;
};

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

fileColumnRegistrar.registerColumn('git', (source) => ({
  init() {
    let prevStatuses: Record<string, GitMixedStatus> = {};

    const statusEqual = (a: GitMixedStatus, b: GitMixedStatus) => {
      return a.x === b.x && a.y === b.y;
    };

    events.on(
      'BufWritePost',
      debounce(1000, async (bufnr) => {
        const bufinfo = await source.nvim.call('getbufinfo', [bufnr]);
        if (bufinfo[0] && bufinfo[0].name) {
          const path = pathLib.dirname(bufinfo[0].name as string);
          await gitManager.reload(path);
          const statuses = await gitManager.getStatuses(path);

          const updatePaths: Set<string> = new Set();
          for (const [path, status] of Object.entries(statuses)) {
            if (path in prevStatuses) {
              if (statusEqual(prevStatuses[path], status)) {
                continue;
              }
              delete prevStatuses[path];
            }
            updatePaths.add(path);
          }
          for (const path of Object.keys(prevStatuses)) {
            updatePaths.add(path);
          }
          const updateNodes = Array.from(updatePaths)
            .map((path) => {
              return source.flattenedNodes.find((node) => node.fullpath === path);
            })
            .filter((node): node is FileNode => !!node);
          await source.renderNodes(updateNodes);
          prevStatuses = statuses;
        }
      }),
    );
  },
  async validate() {
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
  },
  draw(row, node, nodeIndex) {
    const showFormat = (f: string, staged: boolean) => {
      row.add(f, staged ? highlights.stage : highlights.unstage);
    };
    const status = gitManager.getStatus(node.fullpath);
    if (status) {
      showFormat(statusIcons[status.x], true);
      showFormat(statusIcons[status.y], false);
      row.add(' ');
      source.addIndexes('git', nodeIndex);
    } else {
      row.add('   ');
      source.removeIndexes('git', nodeIndex);
    }
  },
}));
