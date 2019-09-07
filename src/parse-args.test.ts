import { parseArgs } from './parse-args';
import { workspace } from 'coc.nvim';

it('should parse args', async () => {
  // @ts-ignore
  workspace.nvim = { call: async () => 'current/filepath' };
  const args = await parseArgs('--filepath', 'filepath', 'path/to/cwd');
  expect(args.cwd).toEqual('path/to/cwd');
  expect(args.filepath).toEqual('filepath');
});
