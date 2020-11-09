import { mapKeys, mapValues } from 'lodash-es';
import pathLib from 'path';
import { normalizePath } from '../util';
import { gitManager } from './manager';
import { GitFormat, GitMixedStatus } from './types';

([
  {
    args: ['path/to/file', false],
    returns: ['path/to/file'],
  },
  {
    args: ['"path/to/file"', false],
    returns: ['path/to/file'],
  },
  {
    args: ['"path test/to/file"', false],
    returns: ['path test/to/file'],
  },
  {
    args: ['"path\\"/to/file"', false],
    returns: ['path"/to/file'],
  },
  {
    args: ['path/to/file with space', false],
    returns: ['path/to/file with space'],
  },
  {
    args: ['path/to/file with space', false],
    returns: ['path/to/file with space'],
  },
  {
    args: ['file.ts -> "file name.ts"', true],
    returns: ['file.ts', 'file name.ts'],
  },
  {
    args: ['"file name.ts" -> file.ts', true],
    returns: ['file name.ts', 'file.ts'],
  },
  {
    args: ['"file name.ts" -> "file name2.ts"', true],
    returns: ['file name.ts', 'file name2.ts'],
  },
] as {
  args: [string, boolean];
  returns: string[];
}[]).forEach((it, index) => {
  test('gitManager parsePath ' + index, () => {
    // @ts-ignore
    const returns = gitManager.cmd.parsePath(...it.args);
    expect(returns).toEqual(it.returns);
  });
});

([
  {
    args: ['MM path/to/file'],
    returns: [GitFormat.modified, GitFormat.modified, '/root/path/to/file'],
  },
  {
    args: ['MM path/to/file with space'],
    returns: [
      GitFormat.modified,
      GitFormat.modified,
      '/root/path/to/file with space',
    ],
  },
  {
    args: ['R  "path/to/file" -> "path/to/file"'],
    returns: [
      GitFormat.renamed,
      GitFormat.unmodified,
      '/root/path/to/file',
      '/root/path/to/file',
    ],
  },
  {
    args: ['C  "path to/file" -> "path to/file"'],
    returns: [
      GitFormat.copied,
      GitFormat.unmodified,
      '/root/path to/file',
      '/root/path to/file',
    ],
  },
] as {
  args: [string];
  returns: [GitFormat, GitFormat, string, string | undefined];
}[]).forEach((it) => {
  test(`gitManager.cmd.parseStatusLine (${it.args[0]})`, () => {
    // @ts-ignore
    const returns = gitManager.cmd.parseStatusLine('/root', ...it.args);
    const [x, y, leftPath, rightPath] = it.returns;
    expect(returns).toEqual([
      x,
      y,
      normalizePath(leftPath),
      ...(rightPath ? [normalizePath(rightPath)] : []),
    ]);
  });
});

describe('gitManager status', () => {
  jest.mock('./manager');

  Object.defineProperty(gitManager, 'getGitRoot', {
    writable: true,
    value: jest.fn().mockImplementation(() => normalizePath('/root')),
  });

  Object.defineProperty(gitManager.cmd, 'spawn', {
    writable: true,
    value: jest
      .fn()
      .mockImplementation(() =>
        [
          'MM src/modified.ts',
          ' M src/modified2.ts',
          ' ? src/util/add.ts',
          'A  src/util/added.ts',
          'D  src/util/deleted.ts',
          'R  src/util/renamed-old.ts -> src/util/renamed-new.ts',
          'C  src/util/copied-old.ts -> src/util/copied-new.ts',
          '!! lib/',
          '!! node_modules/',
          '!! yarn.lock',
        ].join('\n'),
      ),
  });

  test('status', async () => {
    expect(
      await gitManager.cmd.status('/root', {
        showIgnored: true,
      }),
    ).toEqual(
      mapValues(
        mapKeys(
          {
            'src/modified.ts': {
              x: GitFormat.modified,
              y: GitFormat.modified,
              modified: true,
            },
            'src/modified2.ts': {
              x: GitFormat.unmodified,
              y: GitFormat.modified,
              modified: true,
            },
            'src/util/add.ts': {
              x: GitFormat.unmodified,
              y: GitFormat.untracked,
              untracked: true,
            },
            'src/util/added.ts': {
              x: GitFormat.added,
              y: GitFormat.unmodified,
              added: true,
              staged: true,
            },
            'src/util/deleted.ts': {
              x: GitFormat.deleted,
              y: GitFormat.unmodified,
              deleted: true,
              staged: true,
            },
            'src/util/renamed-new.ts': {
              x: GitFormat.renamed,
              y: GitFormat.unmodified,
              renamed: true,
              staged: true,
            },
            'src/util/copied-new.ts': {
              x: GitFormat.copied,
              y: GitFormat.unmodified,
              copied: true,
              staged: true,
            },
            'lib/': {
              x: GitFormat.ignored,
              y: GitFormat.unmodified,
              ignored: true,
            },
            'node_modules/': {
              x: GitFormat.ignored,
              y: GitFormat.unmodified,
              ignored: true,
            },
            'yarn.lock': {
              x: GitFormat.ignored,
              y: GitFormat.unmodified,
              ignored: true,
            },
          },
          (_, path) => normalizePath(pathLib.join('/root', path)),
        ),
        (value, fullpath) => ({
          added: false,
          modified: false,
          deleted: false,
          renamed: false,
          copied: false,
          staged: false,
          unmerged: false,
          untracked: false,
          ignored: false,
          fullpath,
          ...value,
        }),
      ),
    );
  });

  test('getMixedStatuses', async () => {
    await gitManager.reload('/root', { showIgnored: true });
    expect(await gitManager.getMixedStatuses('/root')).toEqual(
      mapKeys(
        {
          src: {
            x: GitFormat.mixed,
            y: GitFormat.mixed,
          },
          'src/util': {
            x: GitFormat.mixed,
            y: GitFormat.untracked,
          },
          'src/modified.ts': {
            x: GitFormat.modified,
            y: GitFormat.modified,
          },
          'src/modified2.ts': {
            x: GitFormat.unmodified,
            y: GitFormat.modified,
          },
          'src/util/add.ts': {
            x: GitFormat.unmodified,
            y: GitFormat.untracked,
          },
          'src/util/added.ts': {
            x: GitFormat.added,
            y: GitFormat.unmodified,
          },
          'src/util/deleted.ts': {
            x: GitFormat.deleted,
            y: GitFormat.unmodified,
          },
          'src/util/renamed-new.ts': {
            x: GitFormat.renamed,
            y: GitFormat.unmodified,
          },
          'src/util/copied-new.ts': {
            x: GitFormat.copied,
            y: GitFormat.unmodified,
          },
        },
        (_, path) => normalizePath(pathLib.join('/root', path)),
      ),
    );
  });

  ([
    [
      ['src', true],
      {
        x: GitFormat.mixed,
        y: GitFormat.mixed,
      },
    ],
    [
      ['src/util', true],
      {
        x: GitFormat.mixed,
        y: GitFormat.untracked,
      },
    ],
    [
      ['yarn.lock', false],
      {
        x: GitFormat.ignored,
        y: GitFormat.unmodified,
      },
    ],
    [
      ['node_modules', true],
      {
        x: GitFormat.ignored,
        y: GitFormat.unmodified,
      },
    ],
    [
      ['node_modules/anyfold', true],
      {
        x: GitFormat.ignored,
        y: GitFormat.unmodified,
      },
    ],
    [
      ['lib/any', true],
      {
        x: GitFormat.ignored,
        y: GitFormat.unmodified,
      },
    ],
  ] as [[string, boolean], GitMixedStatus][]).forEach(([args, result]) => {
    test(`getMixedStatus ${args.join(',')}`, async () => {
      await gitManager.reload('/root', { showIgnored: true });
      expect(
        gitManager.getMixedStatus(
          normalizePath(pathLib.join('/root', args[0])),
          args[1],
        ),
      ).toEqual(result);
    });
  });
});
