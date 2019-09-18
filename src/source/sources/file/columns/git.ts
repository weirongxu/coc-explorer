import commandExists from 'command-exists';
import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnManager } from '../column-manager';
import { GitFormat, gitManager } from '../../../../git-manager';
import pathLib from 'path';

const highlights = {
  stage: hlGroupManager.hlLinkGroupCommand('FileGitStage', 'Comment'),
  unstage: hlGroupManager.hlLinkGroupCommand('FileGitUnstage', 'Operator'),
};
hlGroupManager.register(highlights);

const showIgnored = fileColumnManager.getColumnConfig<boolean>('git.showIgnored')!;

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
  async load(item) {
    const folderPath = item ? (item.directory ? item.fullpath : pathLib.dirname(item.fullpath)) : fileSource.root;
    await gitManager.reload(folderPath, showIgnored);
  },
  beforeDraw() {
    fileSource.gitChangedLineIndexes = [];
  },
  draw(row, item) {
    const showFormat = (f: string, staged: boolean) => {
      if (f.trim().length > 0) {
        row.add(f, staged ? highlights.stage: highlights.unstage);
      } else {
        row.add(f);
      }
    };
    const status = gitManager.getStatus(item.fullpath);
    if (status) {
      if (status.x !== GitFormat.untracked && status.x !== GitFormat.ignored) {
        showFormat(statusIcons[status.x], true);
      } else {
        showFormat(' ', true);
      }
      showFormat(statusIcons[status.y], false);
      row.add(' ');
      fileSource.gitChangedLineIndexes.push(row.line);
    } else {
      row.add('   ');
    }
  },
}));
