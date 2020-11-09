import { workspace } from 'coc.nvim';
import { ExplorerConfig } from '../config';

export const getDiagnosticDisplayMax = (config: ExplorerConfig) => {
  const deprecatedMax = config.get<number>('file.diagnosticCountMax');
  if (deprecatedMax !== undefined) {
    // eslint-disable-next-line no-restricted-properties
    workspace.showMessage(
      'explorer.file.diagnosticCountMax has been deprecated, please use explorer.diagnostic.displayMax in coc-settings.json',
      'warning',
    );
    return deprecatedMax;
  } else {
    return config.get<number>('diagnostic.displayMax')!;
  }
};
