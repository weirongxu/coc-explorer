import { Disposable, workspace } from 'coc.nvim';
import colorConvert from 'color-convert';
import { extractHighlightsColor } from '../highlight/extractColors';
import { hlGroupManager } from '../highlight/manager';
import {
  compactI,
  createColor,
  findNearestColor,
  logger,
  toHex,
} from '../util';
import { GitFormat } from './types';

const hlg = hlGroupManager.linkGroup.bind(hlGroupManager);

export const registerGitHighlights = (disposables: Disposable[]) => {
  hlGroupManager
    .watchColorScheme(disposables, async () => {
      const groups = [
        'String',
        'Character',
        'Number',
        'Boolean',
        'Float',
        'Identifier',
        'Function',
        'Statement',
        'Conditional',
        'Repeat',
        'Label',
        'Operator',
        'Keyword',
        'Exception',
        'PreProc',
        'Include',
        'Define',
        'Macro',
        'PreCondit',
        'Type',
        'StorageClass',
        'Structure',
        'Typedef',
        'Special',
        'SpecialChar',
        'Tag',
        'Delimiter',
        'SpecialComment',
        'Debug',
        'Todo',
      ];

      const highlights = await extractHighlightsColor(groups);
      const fgs = compactI(
        Object.values(highlights).map((h) => {
          const guifg = h.guifg;
          if (!guifg) {
            return;
          }
          const ctermfg =
            h.ctermfg ??
            colorConvert.rgb.ansi256([guifg.red, guifg.green, guifg.blue]);
          return {
            guifg,
            ctermfg,
          };
        }),
      );
      const { nvim } = workspace;
      nvim.pauseNotification();
      const green = findNearestColor(
        createColor(18, 204, 90, 1),
        fgs,
        (it) => it.guifg,
      );
      if (green) {
        nvim.command(
          `highlight default CocExplorerGitPathChange_Internal ctermfg=${
            green.ctermfg
          } guifg=#${toHex(green.guifg)}`,
          true,
        );
      }
      const yellow = findNearestColor(
        createColor(209, 177, 15, 1),
        fgs,
        (it) => it.guifg,
      );
      if (yellow) {
        nvim.command(
          `highlight default CocExplorerGitContentChange_Internal ctermfg=${
            green.ctermfg
          } guifg=#${toHex(yellow.guifg)}`,
          true,
        );
      }
      await nvim.resumeNotification();
    })
    .catch(logger.error);
};

const gitChangedPath = hlg(
  'GitPathChange',
  'CocExplorerGitPathChange_Internal',
);

const gitContentChange = hlg(
  'GitContentChange',
  'CocExplorerGitContentChange_Internal',
);

export const gitHighlights = {
  gitRenamed: hlg('GitRenamed', gitChangedPath.group),
  gitCopied: hlg('GitCopied', gitChangedPath.group),
  gitAdded: hlg('GitAdded', gitChangedPath.group),
  gitUntracked: hlg('GitUntracked', gitChangedPath.group),
  gitUnmerged: hlg('GitUnmerged', gitChangedPath.group),

  gitMixed: hlg('GitMixed', gitContentChange.group),
  gitModified: hlg('GitModified', gitContentChange.group),

  gitDeleted: hlg('GitDeleted', 'Error'),

  gitIgnored: hlg('GitIgnored', 'Comment'),

  gitStaged: hlg('GitStaged', 'Comment'),
  gitUnstaged: hlg('GitUnstaged', 'Operator'),
};

export const getGitFormatHighlight = (format: GitFormat) => {
  switch (format) {
    case GitFormat.mixed:
      return gitHighlights.gitMixed;
    case GitFormat.modified:
      return gitHighlights.gitModified;
    case GitFormat.added:
      return gitHighlights.gitAdded;
    case GitFormat.deleted:
      return gitHighlights.gitDeleted;
    case GitFormat.renamed:
      return gitHighlights.gitRenamed;
    case GitFormat.copied:
      return gitHighlights.gitCopied;
    case GitFormat.unmerged:
      return gitHighlights.gitUnmerged;
    case GitFormat.untracked:
      return gitHighlights.gitUntracked;
  }
};
