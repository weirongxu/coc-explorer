import { parseArgs, Args } from './parse-args';
import { workspace } from 'coc.nvim';

it('should parse args', async () => {
  // @ts-ignore
  workspace.nvim = { call: async () => '/buffer/path' };
  let args: Args;
  args = await parseArgs('--reveal', '/reveal/path', '/cwd/path');
  expect(args.cwd).toEqual('/cwd/path');
  expect(args.revealPath).toEqual('/reveal/path');

  args = await parseArgs('--toggle');
  expect(args.toggle).toEqual(true);

  args = await parseArgs('--no-toggle');
  expect(args.toggle).toEqual(false);
});
