import commandExists from 'command-exists';
import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnManager } from '../column-manager';
import { GitFormat, gitManager } from '../../../../git-manager';
import pathLib from 'path';

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
  // TODO remove
  // beforeDraw() {
  //   fileSource.gitChangedLineIndexes = [];
  // },
  draw(row, item) {
    const showFormat = (f: string, staged: boolean) => {
      // if (f.trim().length > 0) {
      row.add(f, staged ? highlights.stage : highlights.unstage);
      // } else {
      //   row.add(f);
      // }
    };
    const status = gitManager.getStatus(item.fullpath);
    if (status) {
      showFormat(statusIcons[status.x], true);
      showFormat(statusIcons[status.y], false);
      row.add(' ');
      // fileSource.gitChangedLineIndexes.push(row.line);
    } else {
      row.add('   ');
    }
  },
}));
