import { hlGroupManager } from '../highlight/manager';

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);
export const diagnosticHighlights = {
  diagnosticError: hl('DiagnosticError', 'CocErrorSign'),
  diagnosticWarning: hl('DiagnosticWarning', 'CocWarningSign'),
};
