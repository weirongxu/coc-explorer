import { Args, argOptions } from './parse-args';
import { workspace } from 'coc.nvim';

it('should parse args', async () => {
  const oldNvim = workspace.nvim;
  // @ts-ignore
  workspace.nvim = { call: async (fn) => (fn === 'getcwd' ? '/buffer/path' : oldNvim()) };
  const rootPath = '/root/path';
  let args: Args;
  args = await Args.parse([rootPath, '--reveal', '/reveal/path', '/cwd/path']);
  expect(await args.rootPath()).toEqual('/cwd/path');
  expect(await args.value(argOptions.reveal)).toEqual('/reveal/path');

  args = await Args.parse([rootPath, '--toggle']);
  expect(await args.value(argOptions.toggle)).toEqual(true);
  expect(await args.rootPath()).toEqual('/root/path');

  args = await Args.parse([rootPath, '--no-toggle']);
  expect(await args.value(argOptions.toggle)).toEqual(false);
  expect(await args.rootPath()).toEqual('/root/path');

  args = await Args.parse([rootPath, '--file-columns=git:filename;fullpath;size;modified']);
  expect(await args.value(argOptions.fileColumns)).toEqual([
    'git',
    'filename',
    ['fullpath'],
    ['size'],
    ['modified'],
  ]);

  // @ts-ignore
  workspace.nvim = oldNvim;
});
