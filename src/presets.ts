import { workspace } from 'coc.nvim';
import { config } from './util';

export type Presets = Record<string, object>;

export async function getPresets(): Promise<Presets> {
  const presets = (await workspace.nvim.eval('get(g:, "coc_explorer_global_presets", {})')) as Presets;
  return {
    ...presets,
    ...config.get<Presets>('presets'),
  };
}
