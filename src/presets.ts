import { workspace, WorkspaceConfiguration } from 'coc.nvim';

export type PresetMap = Map<string, Map<string, unknown>>;

type PresetRecord = Record<string, object>;

export async function getPresets(
  config: WorkspaceConfiguration,
): Promise<PresetMap> {
  const presets = (await workspace.nvim.eval(
    'get(g:, "coc_explorer_global_presets", {})',
  )) as PresetRecord;
  return new Map(
    Object.entries({
      ...presets,
      ...config.get<PresetRecord>('presets'),
    }).map(([k, v]) => [k, new Map(Object.entries(v))]),
  );
}
