import { Disposable, workspace } from 'coc.nvim';
import { generateHighlightFg, logger } from '../util';
import { extractHighlightsColor } from './extractColors';
import { hlGroupManager } from './manager';

const groupConfigs = {
  Error: 'ErrorColor',
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
        const cmd = generateHighlightFg(
          `CocExplorer${groupConfigs[group]}_Internal`,
          hl,
        );
        if (!cmd) {
          continue;
        }
        nvim.command(cmd, true);
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
