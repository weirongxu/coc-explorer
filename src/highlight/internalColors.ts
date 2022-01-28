import { Disposable, workspace } from 'coc.nvim';
import colorConvert from 'color-convert';
import { logger, toHex } from '../util';
import { extractHighlightsColor } from './extractColors';
import { hlGroupManager } from './manager';

const groupConfigs = {
  Comment: 'CommentColor',
  Normal: 'NormalColor',
  CocErrorSign: 'CocErrorSignColor',
  CocWarningSign: 'CocWarningSignColor',
} as const;
type GroupConfig = typeof groupConfigs;
type GroupConfigKey = keyof GroupConfig;
type GroupConfigValue = GroupConfig[GroupConfigKey];

export const registerInternalColors = (disposables: Disposable[]) => {
  hlGroupManager
    .watchColorScheme(disposables, async () => {
      const groups = Object.keys(groupConfigs) as GroupConfigKey[];
      const highlights = await extractHighlightsColor(groups);

      const { nvim } = workspace;
      nvim.pauseNotification();
      for (const group of groups) {
        const hl = highlights[group];
        if (!hl) {
          continue;
        }
        const guifg = hl.guifg;
        if (!guifg) {
          continue;
        }
        const ctermfg =
          hl.ctermfg ??
          colorConvert.rgb.ansi256([guifg.red, guifg.green, guifg.blue]);

        nvim.command(
          `highlight default CocExplorer${
            groupConfigs[group]
          }_Internal ctermfg=${ctermfg} guifg=#${toHex(guifg)}`,
          true,
        );
      }
      await nvim.resumeNotification();
    })
    .catch(logger.error);
};

const internalHighlightGroups = {} as Record<GroupConfigValue, string>;

Object.values(groupConfigs).forEach((group) => {
  internalHighlightGroups[group] = `CocExplorer${group}_Internal`;
});

export { internalHighlightGroups };
