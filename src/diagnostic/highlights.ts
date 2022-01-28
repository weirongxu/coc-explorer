import { internalHighlightGroups } from '../highlight/internalColors';
import { hlGroupManager } from '../highlight/manager';

const hlg = hlGroupManager.linkGroup.bind(hlGroupManager);
export const diagnosticHighlights = {
  diagnosticError: hlg(
    'DiagnosticError',
    internalHighlightGroups.CocErrorSignColor,
  ),
  diagnosticWarning: hlg(
    'DiagnosticWarning',
    internalHighlightGroups.CocWarningSignColor,
  ),
};
