import { Color, workspace } from 'coc.nvim';
import { parseColor } from '../util';

export type HighlightColorString = {
  guibg: string;
  guifg: string;
  ctermbg: string;
  ctermfg: string;
};

export type HighlightColor = {
  guibg?: Color;
  guifg?: Color;
  ctermbg?: string;
  ctermfg?: string;
};

export async function extractHighlightsColor(
  highlightGroups: string[],
): Promise<Record<string, HighlightColor>> {
  const hlColorStrs: Record<string, HighlightColorString> =
    await workspace.nvim.call('coc_explorer#highlight#extract_colors', [
      highlightGroups,
    ]);
  return Object.entries(hlColorStrs)
    .map(([group, hl]) => {
      const newHl: HighlightColor = {};
      if (hl.ctermfg) {
        newHl.ctermfg = hl.ctermfg;
      }
      if (hl.ctermbg) {
        newHl.ctermbg = hl.ctermbg;
      }
      if (hl.guifg) {
        newHl.guifg = parseColor(hl.guifg);
      }
      if (hl.guibg) {
        newHl.guibg = parseColor(hl.guibg);
      }
      return [group, newHl] as const;
    })
    .reduce<Record<string, HighlightColor>>((ret, [group, hl]) => {
      ret[group] = hl;
      return ret;
    }, {});
}
