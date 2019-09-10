import { parseArgs } from './parse-args';
import { workspace } from 'coc.nvim';

it('should parse args', async () => {
  // @ts-ignore
  workspace.nvim = { call: async () => '/buffer/path' };
  const args = await parseArgs('--reveal', '/reveal/path', '/cwd/path');
  expect(args.cwd).toEqual('/cwd/path');
  expect(args.revealPath).toEqual('/reveal/path');
});
