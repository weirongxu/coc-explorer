import { gitManager, GitFormat } from './git-manager';

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
    returns: [GitFormat.modified, GitFormat.modified, '/root/path/to/file with space'],
  },
  {
    args: ['R  "path/to/file" -> "path/to/file"'],
    returns: [GitFormat.renamed, GitFormat.unmodified, '/root/path/to/file', '/root/path/to/file'],
  },
  {
    args: ['C  "path to/file" -> "path to/file"'],
    returns: [GitFormat.copied, GitFormat.unmodified, '/root/path to/file', '/root/path to/file'],
  },
] as {
  args: [string];
  returns: [GitFormat, GitFormat, string, string | null];
}[]).forEach((it, index) => {
  test('gitManager parseStatusLine ' + index, () => {
    // @ts-ignore
    const returns = gitManager.cmd.parseStatusLine('/root', ...it.args);
    expect(returns).toEqual(it.returns);
  });
});
