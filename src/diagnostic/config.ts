import type { ExplorerConfig } from '../config';
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
