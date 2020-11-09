import { hlGroupManager } from '../source/highlights/highlightManager';

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);
export const diagnosticHighlights = {
  diagnosticError: hl('DiagnosticError', 'CocErrorSign'),
  diagnosticWarning: hl('DiagnosticWarning', 'CocWarningSign'),
};
