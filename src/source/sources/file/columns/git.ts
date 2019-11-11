import commandExists from 'command-exists';
import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnManager } from '../column-manager';
import { GitFormat, gitManager } from '../../../../git-manager';
import pathLib from 'path';
import { events } from 'coc.nvim';
import { debounce } from '../../../../util';
import { GitIndexes } from '../../../../indexes/git-indexes';

const highlights = {
  stage: hlGroupManager.hlLinkGroupCommand('FileGitStage', 'Comment'),
  unstage: hlGroupManager.hlLinkGroupCommand('FileGitUnstage', 'Operator'),
};

const getIconConf = (name: string) => {
  return fileColumnManager.getColumnConfig<string>('git.icon.' + name)!;
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

fileColumnManager.registerColumn('git', (fileSource) => ({
  init() {
    const gitIndexes = new GitIndexes(fileSource);
    fileSource.explorer.indexesManager.addIndexes('git', gitIndexes);

    events.on(
      'BufWritePost',
      debounce(1000, async (bufnr) => {
        const bufinfo = await fileSource.nvim.call('getbufinfo', [bufnr]);
        if (bufinfo[0] && bufinfo[0].name) {
          const path = pathLib.dirname(bufinfo[0].name as string);
          await gitManager.reload(path);
          const statuses = await gitManager.getStatuses(path);
          await gitIndexes?.updateStatus(statuses);
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
  async load(node) {
    const folderPath =
      'isRoot' in node
        ? fileSource.root
        : node.directory
        ? node.fullpath
        : pathLib.dirname(node.fullpath);
    await gitManager.reload(folderPath);
  },
  draw(row, item) {
    const showFormat = (f: string, staged: boolean) => {
      row.add(f, staged ? highlights.stage : highlights.unstage);
    };
    const status = gitManager.getStatus(item.fullpath);
    if (status) {
      showFormat(statusIcons[status.x], true);
      showFormat(statusIcons[status.y], false);
      row.add(' ');
    } else {
      row.add('   ');
    }
  },
}));
