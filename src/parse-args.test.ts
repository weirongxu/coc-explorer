import { Args, argOptions } from './parse-args';
import { workspace } from 'coc.nvim';

it('should parse args', async () => {
  const oldNvim = workspace.nvim;
  // @ts-ignore
  workspace.nvim = { call: async (fn) => (fn === 'getcwd' ? '/buffer/path' : oldNvim()) };
  const rootUri = '/root/path';
  let args: Args;
  args = await Args.parse([rootUri, '--reveal', '/reveal/path', '/cwd/path']);
  expect(await args.value(argOptions.rootUri)).toEqual('/cwd/path');
  expect(await args.value(argOptions.reveal)).toEqual('/reveal/path');

  args = await Args.parse([rootUri, '--toggle']);
  expect(await args.value(argOptions.toggle)).toEqual(true);
  expect(await args.value(argOptions.rootUri)).toEqual('/root/path');

  args = await Args.parse([rootUri, '--no-toggle']);
  expect(await args.value(argOptions.toggle)).toEqual(false);
  expect(await args.value(argOptions.rootUri)).toEqual('/root/path');

  args = await Args.parse([rootUri, '--file-child-template', '[git][fileame] [fullpath]']);
  expect(await args.value(argOptions.fileChildTemplate)).toEqual('[git][fileame] [fullpath]');

  // @ts-ignore
  workspace.nvim = oldNvim;
});
