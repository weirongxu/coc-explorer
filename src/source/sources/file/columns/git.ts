import commandExists from 'command-exists';
import pathLib from 'path';
import { getGitRoot, gitCommand } from '../../../../util';
import { hlGroupManager } from '../../../highlight-manager';
import { fileColumnManager } from '../column-manager';
import { workspace } from 'coc.nvim';

const highlights = {
  sign: hlGroupManager.hlLinkGroupCommand('FileGitSign', 'Operator'),
};
hlGroupManager.register(highlights);

const showIgnored = fileColumnManager.getColumnConfig<boolean>('git.showIgnored')!;

enum Format {
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

type GitDirectoryStatus = '*' | Format;

let gitDirectoryCache: Record<
  string,
  {
    x: GitDirectoryStatus;
    y: GitDirectoryStatus;
  }
> = {};

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
        if (cache.x !== '*') {
          if (cache.x !== status.x) {
            if (cache.x === Format.unmodified) {
              cache.x = status.x;
            } else {
              cache.x = '*';
            }
          }
        }
        if (cache.y !== '*') {
          if (cache.y !== status.y) {
            if (cache.y === Format.unmodified) {
              cache.y = status.y;
            } else {
              cache.y = '*';
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
    if (item.directory) {
      if (item.fullpath in gitDirectoryCache) {
        const status = gitDirectoryCache[item.fullpath];
        row.add(status.x + status.y, highlights.sign.group);
        row.add(' ');
      } else {
        row.add('   ');
      }
    } else if (item.fullpath in gitStatusCache) {
      const status = gitStatusCache[item.fullpath];
      row.add(status.x.toString(), highlights.sign.group);
      row.add(status.y.toString(), highlights.sign.group);
      row.add(' ');
    } else {
      row.add('   ');
    }
  },
}));
