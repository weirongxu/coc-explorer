import commandExists from 'command-exists';
import pathLib from 'path';
import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnManager } from '../column-manager';
import { GitFormat, GitStatus, gitManager } from '../../../../git-manager';

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

let gitStatusCache: Record<string, GitStatus> = {};

type GitDirectoryStatus = {
  x: GitFormat;
  y: GitFormat;
};

let gitDirectoryCache: Record<string, GitDirectoryStatus> = {};

function generateDirectoryStatus(root: string) {
  Object.entries(gitStatusCache).forEach(([fullpath, status]) => {
    const relativePath = pathLib.relative(root, fullpath);
    const parts = relativePath.split(pathLib.sep);
    for (let i = 1; i <= parts.length; i++) {
      const parentPath = pathLib.join(root, parts.slice(0, i).join(pathLib.sep));
      const cache = gitDirectoryCache[parentPath];
      if (cache) {
        if (cache.x !== GitFormat.mixed) {
          if (cache.x !== status.x) {
            if (cache.x === GitFormat.unmodified) {
              cache.x = status.x;
            } else {
              cache.x = GitFormat.mixed;
            }
          }
        }
        if (cache.y !== GitFormat.mixed) {
          if (cache.y !== status.y) {
            if (cache.y === GitFormat.unmodified) {
              cache.y = status.y;
            } else {
              cache.y = GitFormat.mixed;
            }
          }
        }
      } else {
        gitDirectoryCache[parentPath] = {
          x: status.x,
          y: status.y,
        };
      }
    }
  });
}

async function loadStatus(path: string) {
  gitDirectoryCache = {};
  const root = await gitManager.getGitRoot(path);
  if (root) {
    gitStatusCache = await gitManager.fetchStatus(root, showIgnored);
    generateDirectoryStatus(root);
  }
}

fileColumnManager.registerColumn('git', (fileSource) => ({
  async validate() {
    try {
      await commandExists('git');
      return true;
    } catch (e) {
      return false;
    }
  },
  async load() {
    await loadStatus(fileSource.root);
  },
  draw(row, item) {
    const showFormat = (f: string, staged: boolean) => {
      if (f.trim().length > 0) {
        row.add(f, staged ? highlights.stage.group : highlights.unstage.group);
      } else {
        row.add(f);
      }
    };
    if (item.directory) {
      if (item.fullpath in gitDirectoryCache) {
        const status = gitDirectoryCache[item.fullpath];
        if (status.x !== status.y) {
          showFormat(statusIcons[status.x], true);
        } else {
          showFormat(' ', true);
        }
        showFormat(statusIcons[status.y], false);
        row.add(' ');
      } else {
        row.add('   ');
      }
    } else if (item.fullpath in gitStatusCache) {
      const status = gitStatusCache[item.fullpath];
      if (status.x !== status.y) {
        showFormat(statusIcons[status.x], true);
      } else {
        showFormat(' ', true);
      }
      showFormat(statusIcons[status.y], false);
      row.add(' ');
    } else {
      row.add('   ');
    }
  },
}));
