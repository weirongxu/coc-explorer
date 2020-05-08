import { workspace, WorkspaceConfiguration } from 'coc.nvim';

export type Presets = Record<string, object>;

export async function getPresets(
  config: WorkspaceConfiguration,
): Promise<Presets> {
  const presets = (await workspace.nvim.eval(
    'get(g:, "coc_explorer_global_presets", {})',
  )) as Presets;
  return {
    ...presets,
    ...config.get<Presets>('presets'),
  };
}
