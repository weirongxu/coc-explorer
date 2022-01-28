import { Disposable, workspace } from 'coc.nvim';
import colorConvert from 'color-convert';
import { extractHighlightsColor } from '../highlight/extractColors';
import { internalHighlightGroups } from '../highlight/internalColors';
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
  renamed: hlg('GitRenamed', gitChangedPath.group),
  copied: hlg('GitCopied', gitChangedPath.group),
  added: hlg('GitAdded', gitChangedPath.group),
  untracked: hlg('GitUntracked', gitChangedPath.group),
  unmerged: hlg('GitUnmerged', gitChangedPath.group),

  mixed: hlg('GitMixed', gitContentChange.group),
  modified: hlg('GitModified', gitContentChange.group),

  deleted: hlg('GitDeleted', internalHighlightGroups.ErrorColor),

  ignored: hlg('GitIgnored', internalHighlightGroups.CommentColor),

  staged: hlg('GitStaged', internalHighlightGroups.CommentColor),
  unstaged: hlg('GitUnstaged', 'Operator'),
};

export const getGitFormatHighlight = (format: GitFormat) => {
  switch (format) {
    case GitFormat.mixed:
      return gitHighlights.mixed;
    case GitFormat.modified:
      return gitHighlights.modified;
    case GitFormat.added:
      return gitHighlights.added;
    case GitFormat.deleted:
      return gitHighlights.deleted;
    case GitFormat.renamed:
      return gitHighlights.renamed;
    case GitFormat.copied:
      return gitHighlights.copied;
    case GitFormat.unmerged:
      return gitHighlights.unmerged;
    case GitFormat.untracked:
      return gitHighlights.untracked;
  }
};
