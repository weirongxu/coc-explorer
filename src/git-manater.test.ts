import { gitManager, GitFormat } from './git-manager';

([
  {
    args: ['path/to/file', 0],
    returns: [12, 'path/to/file'],
  },
  {
    args: ['"path/to/file"', 0],
    returns: [14, 'path/to/file'],
  },
  {
    args: ['pre "path/to/file"', 4],
    returns: [18, 'path/to/file'],
  },
  {
    args: ['"path test/to/file"', 0],
    returns: [19, 'path test/to/file'],
  },
  {
    args: ['"path\\"/to/file"', 0],
    returns: [16, 'path"/to/file'],
  },
] as {
  args: [string, number];
  returns: [number, string];
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
    args: ['MM "path/to/file" -> "path/to/file"'],
    returns: [GitFormat.modified, GitFormat.modified, '/root/path/to/file', '/root/path/to/file'],
  },
  {
    args: ['MM "path to/file" -> "path to/file"'],
    returns: [GitFormat.modified, GitFormat.modified, '/root/path to/file', '/root/path to/file'],
  },
] as {
  args: [string];
  returns: [GitFormat, GitFormat, string, string | null];
}[]).forEach((it, index) => {
  test('gitManager parseStatusLine ' + index, () => {
    // @ts-ignore
    const returns = gitManager.cmd.parseStatusLine(...['/root', ...it.args]);
    expect(returns).toEqual(it.returns);
  });
});
