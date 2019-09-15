import commandExists from 'command-exists';
import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnManager } from '../column-manager';
import { GitFormat, gitManager } from '../../../../git-manager';

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

export let gitChangedLineIndexs: number[] = [];

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
    await gitManager.reload(item ? item.fullpath : fileSource.root, showIgnored);
  },
  beforeDraw() {
    gitChangedLineIndexs = [];
  },
  draw(row, item) {
    const showFormat = (f: string, staged: boolean) => {
      if (f.trim().length > 0) {
        row.add(f, staged ? highlights.stage.group : highlights.unstage.group);
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
      gitChangedLineIndexs.push(row.line);
    } else {
      row.add('   ');
    }
  },
}));
