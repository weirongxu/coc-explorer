import commandExists from 'command-exists';
import pathLib from 'path';
import { getGitRoot, gitCommand } from '../../../../util';
import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnManager } from '../column-manager';

const highlights = {
  stage: hlGroupManager.hlLinkGroupCommand('FileGitStage', 'Comment'),
  unstage: hlGroupManager.hlLinkGroupCommand('FileGitUnstage', 'Operator'),
};
hlGroupManager.register(highlights);

const showIgnored = fileColumnManager.getColumnConfig<boolean>('git.showIgnored')!;

const getIconConf = (name: string) => {
  return fileColumnManager.getColumnConfig<string>('git.icon.' + name)!;
};

enum Format {
  mixed = '*',
  unmodified = ' ',
  modified = 'M',
  added = 'A',
  deleted = 'D',
  renamed = 'R',
  copied = 'C',
  unmerged = 'U',
  untracked = '?',
  ignored = '!',
}

const statusIcons = {
  [Format.mixed]: getIconConf('mixed'),
  [Format.unmodified]: getIconConf('unmodified'),
  [Format.modified]: getIconConf('modified'),
  [Format.added]: getIconConf('added'),
  [Format.deleted]: getIconConf('deleted'),
  [Format.renamed]: getIconConf('renamed'),
  [Format.copied]: getIconConf('copied'),
  [Format.unmerged]: getIconConf('unmerged'),
  [Format.untracked]: getIconConf('untracked'),
  [Format.ignored]: getIconConf('ignored'),
};

type GitStatus = {
  fullpath: string;
  x: Format;
  y: Format;

  added: boolean;
  modified: boolean;
  deleted: boolean;
  renamed: boolean;
  copied: boolean;

  stated: boolean;
  unmerged: boolean;
  untracked: boolean;
  ignored: boolean;
};

let gitStatusCache: Record<string, GitStatus> = {};

type GitDirectoryStatus = {
  x: Format;
  y: Format;
};

let gitDirectoryCache: Record<string, GitDirectoryStatus> = {};

function parseFormat(format: string): Format {
  for (const name in Format) {
    if (format === Format[name]) {
      return Format[name] as Format;
    }
  }
  return Format.unmodified;
}

function parseLine(gitRoot: string, line: string): [string, Format, Format] {
  return [pathLib.join(gitRoot, line.slice(3)), parseFormat(line[0]), parseFormat(line[1])];
}

function generateDirectoryStatus(root: string) {
  Object.entries(gitStatusCache).forEach(([fullpath, status]) => {
    const relativePath = pathLib.relative(root, fullpath);
    const parts = relativePath.split(pathLib.sep);
    for (let i = 1; i <= parts.length; i++) {
      const parentPath = pathLib.join(root, parts.slice(0, i).join(pathLib.sep));
      const cache = gitDirectoryCache[parentPath];
      if (cache) {
        if (cache.x !== Format.mixed) {
          if (cache.x !== status.x) {
            if (cache.x === Format.unmodified) {
              cache.x = status.x;
            } else {
              cache.x = Format.mixed;
            }
          }
        }
        if (cache.y !== Format.mixed) {
          if (cache.y !== status.y) {
            if (cache.y === Format.unmodified) {
              cache.y = status.y;
            } else {
              cache.y = Format.mixed;
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

async function fetchGitStatus(path: string) {
  gitStatusCache = {};
  gitDirectoryCache = {};
  const root = await getGitRoot(path);
  if (root) {
    const args = ['status', '--porcelain', '-u'];
    if (showIgnored) {
      args.push('--ignored');
    }
    const output = await gitCommand(args, { cwd: root });
    const lines = output.split('\n');
    lines.forEach((line) => {
      const [fullpath, x, y] = parseLine(root, line);

      const changedList = [Format.modified, Format.added, Format.deleted, Format.renamed, Format.copied];
      const added = x === Format.added || y === Format.added;
      const modified = x === Format.modified || y === Format.modified;
      const deleted = x === Format.deleted || y === Format.deleted;
      const renamed = x === Format.renamed || y === Format.renamed;
      const copied = x === Format.copied || y === Format.copied;
      const stated = changedList.includes(x) && y === Format.unmodified;
      const unmerged =
        (x === Format.deleted && y === Format.deleted) ||
        (x === Format.added && y === Format.added) ||
        x === Format.unmerged ||
        y === Format.unmerged;
      const ignored = x === Format.ignored;
      const untracked = x === Format.untracked;

      gitStatusCache[fullpath] = {
        fullpath,
        x,
        y,

        added,
        modified,
        deleted,
        renamed,
        copied,

        stated,
        unmerged,
        untracked,
        ignored,
      };
    });
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
    await fetchGitStatus(fileSource.root);
  },
  draw(row, item) {
    const showFormat = (f: string, staged: boolean) => {
      if (f.trim()) {
        row.add(f, staged ? highlights.stage.group : highlights.unstage.group);
      } else {
        row.add(f);
      }
    };
    if (item.directory) {
      if (item.fullpath in gitDirectoryCache) {
        const status = gitDirectoryCache[item.fullpath];
        showFormat(statusIcons[status.x], true);
        showFormat(statusIcons[status.y], false);
        row.add(' ');
      } else {
        row.add('   ');
      }
    } else if (item.fullpath in gitStatusCache) {
      const status = gitStatusCache[item.fullpath];
      showFormat(statusIcons[status.x], true);
      showFormat(statusIcons[status.y], false);
      row.add(' ');
    } else {
      row.add('   ');
    }
  },
}));
