import { hlGroupManager } from '../highlight/manager';

const hlg = hlGroupManager.linkGroup.bind(hlGroupManager);
export const diagnosticHighlights = {
  diagnosticError: hlg('DiagnosticError', 'CocErrorSign'),
  diagnosticWarning: hlg('DiagnosticWarning', 'CocWarningSign'),
};
