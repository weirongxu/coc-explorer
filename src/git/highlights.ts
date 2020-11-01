import { hlGroupManager } from '../source/highlightManager';

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);
const h = hlGroupManager.group.bind(hlGroupManager);

const gitChangedPath = h('GitPathChange', 'ctermfg=green guifg=green');

const gitContentChange = h('GitContentChange', 'ctermfg=yellow guifg=yellow');

export const gitHighlights = {
  gitRenamed: hl('GitRenamed', gitChangedPath.group),
  gitCopied: hl('GitCopied', gitChangedPath.group),
  gitAdded: hl('GitAdded', gitChangedPath.group),
  gitUntracked: hl('GitUntracked', gitChangedPath.group),
  gitUnmodified: hl('GitUnmodified', gitChangedPath.group),
  gitUnmerged: hl('GitUnmerged', gitChangedPath.group),

  gitMixed: hl('GitMixed', gitContentChange.group),
  gitModified: hl('GitModified', gitContentChange.group),

  gitDeleted: h('GitDeleted', 'ctermfg=red guifg=red'),

  gitIgnored: h('GitIgnored', 'ctermfg=gray guifg=gray'),
};
