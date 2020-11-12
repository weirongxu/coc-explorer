import { Args } from './parseArgs';
import { workspace } from 'coc.nvim';
import { argOptions } from './argOptions';
import { config } from './config';
import { normalizePath } from './util';
import { fileArgOptions } from './source/sources/file/argOptions';

it('should parse args', async () => {
  const oldNvim = workspace.nvim;
  // @ts-ignore
  workspace.nvim = {
    // @ts-ignore
    call: async (fn) => (fn === 'getcwd' ? '/buffer/path' : oldNvim()),
  };
  const rootUri = '/root/path';
  let args: Args;
  args = await Args.parse(
    [rootUri, '--reveal', '/reveal/path', '/cwd/path'],
    config,
  );
  expect(await args.value(argOptions.rootUri)).toEqual(rootUri);
  expect(await args.value(argOptions.reveal)).toEqual(
    normalizePath('/reveal/path'),
  );

  args = await Args.parse([rootUri, '--toggle'], config);
  expect(await args.value(argOptions.toggle)).toEqual(true);
  expect(await args.value(argOptions.rootUri)).toEqual(rootUri);

  args = await Args.parse([rootUri, '--no-toggle'], config);
  expect(await args.value(argOptions.toggle)).toEqual(false);
  expect(await args.value(argOptions.rootUri)).toEqual(rootUri);

  args = await Args.parse(
    [rootUri, '--file-child-template', '[git][fileame] [fullpath]'],
    config,
  );
  expect(await args.value(fileArgOptions.fileChildTemplate)).toEqual(
    '[git][fileame] [fullpath]',
  );

  // @ts-ignore
  workspace.nvim = oldNvim;
});
