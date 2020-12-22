import { workspace } from 'coc.nvim';
import { Color } from 'vscode-languageserver-protocol';
import { hlGroupManager } from '../highlight/manager';
import { parseHighlight } from '../highlight/parseHighlight';
import {
  compactI,
  findNearestColor,
  onError,
  parseColor,
  toHex,
} from '../util';
import { GitFormat } from './types';

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);

hlGroupManager
  .registerGroup(async () => {
    const groupsExecute = [
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
    ]
      .map((g) => `execute('hi ${g}')`)
      .join(',');
    const hiStmts = (await workspace.nvim.eval(
      `[${groupsExecute}]`,
    )) as string[];
    const highlights = hiStmts.map((h) => parseHighlight(h.trim()));
    const fgs = compactI(
      highlights.map((h) => {
        const fg = h.attrs?.['guifg'];
        if (fg) {
          return parseColor(fg);
        }
      }),
    );
    const { nvim } = workspace;
    nvim.pauseNotification();
    const green = findNearestColor(Color.create(18, 204, 90, 1), fgs);
    if (green) {
      nvim.command(
        `highlight default CocExplorerGitPathChange_Internal guifg=#${toHex(
          green,
        )}`,
        true,
      );
    }
    const yellow = findNearestColor(Color.create(209, 177, 15, 1), fgs);
    if (yellow) {
      nvim.command(
        `highlight default CocExplorerGitContentChange_Internal guifg=#${toHex(
          yellow,
        )}`,
        true,
      );
    }
    await nvim.resumeNotification();
  })
  .catch(onError);

const gitChangedPath = hl('GitPathChange', 'CocExplorerGitPathChange_Internal');

const gitContentChange = hl(
  'GitContentChange',
  'CocExplorerGitContentChange_Internal',
);

export const gitHighlights = {
  gitRenamed: hl('GitRenamed', gitChangedPath.group),
  gitCopied: hl('GitCopied', gitChangedPath.group),
  gitAdded: hl('GitAdded', gitChangedPath.group),
  gitUntracked: hl('GitUntracked', gitChangedPath.group),
  gitUnmerged: hl('GitUnmerged', gitChangedPath.group),

  gitMixed: hl('GitMixed', gitContentChange.group),
  gitModified: hl('GitModified', gitContentChange.group),

  gitDeleted: hl('GitDeleted', 'Error'),

  gitIgnored: hl('GitIgnored', 'Comment'),

  gitStaged: hl('GitStaged', 'Comment'),
  gitUnstaged: hl('GitUnstaged', 'Operator'),
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
