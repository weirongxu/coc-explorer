import { hlGroupManager } from '../source/highlights/highlightManager';
import { GitFormat, GitMixedStatus } from './types';

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);
const h = hlGroupManager.group.bind(hlGroupManager);

const gitChangedPath = h('GitPathChange', 'ctermfg=green guifg=green');

const gitContentChange = h('GitContentChange', 'ctermfg=yellow guifg=yellow');

export const gitHighlights = {
  gitRenamed: hl('GitRenamed', gitChangedPath.group),
  gitCopied: hl('GitCopied', gitChangedPath.group),
  gitAdded: hl('GitAdded', gitChangedPath.group),
  gitUntracked: hl('GitUntracked', gitChangedPath.group),
  gitUnmerged: hl('GitUnmerged', gitChangedPath.group),

  gitMixed: hl('GitMixed', gitContentChange.group),
  gitModified: hl('GitModified', gitContentChange.group),

  gitDeleted: h('GitDeleted', 'ctermfg=red guifg=red'),

  gitIgnored: h('GitIgnored', 'ctermfg=gray guifg=gray'),

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
