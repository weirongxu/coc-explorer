import { parseArgs, Args } from './parse-args';
import { workspace } from 'coc.nvim';

it('should parse args', async () => {
  // @ts-ignore
  workspace.nvim = { call: async () => '/buffer/path' };
  const rootPath = '/root/path';
  let args: Args;
  args = await parseArgs([rootPath, '--reveal', '/reveal/path', '/cwd/path']);
  expect(args.rootPath).toEqual('/cwd/path');
  expect(args.revealPath).toEqual('/reveal/path');

  args = await parseArgs([rootPath, '--toggle']);
  expect(args.toggle).toEqual(true);
  expect(args.rootPath).toEqual('/root/path');

  args = await parseArgs([rootPath, '--no-toggle']);
  expect(args.toggle).toEqual(false);
  expect(args.rootPath).toEqual('/root/path');
});
