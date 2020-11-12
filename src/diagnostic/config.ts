import { workspace } from 'coc.nvim';
import { ExplorerConfig } from '../config';
import { toSubscriptNumbers } from '../util';

type DiagnosisConfig = {
  displayMax: number;
  enableSubscriptNumber: boolean;
};

export const getDiagnosticConfig = (config: ExplorerConfig) => {
  const diagnosticConfig: DiagnosisConfig = {
    displayMax: config.get<number>('diagnostic.displayMax')!,
    enableSubscriptNumber: config.get<boolean>(
      'diagnostic.enableSubscriptNumber',
    ),
  };

  const deprecatedMax = config.get<number>('file.diagnosticCountMax');
  if (deprecatedMax !== undefined) {
    // eslint-disable-next-line no-restricted-properties
    workspace.showMessage(
      'explorer.file.diagnosticCountMax has been deprecated, please use explorer.diagnostic.displayMax in coc-settings.json',
      'warning',
    );
    diagnosticConfig.displayMax = deprecatedMax;
  }

  return diagnosticConfig;
};

export const printDiagnosticCount = (
  count: number,
  config: DiagnosisConfig,
) => {
  if (count > config.displayMax) {
    return '✗';
  } else if (config.enableSubscriptNumber) {
    return toSubscriptNumbers(count);
  } else {
    return count.toString();
  }
};
