import { hlGroupManager } from '../source/highlightManager';

import convert from 'color-convert';
import { RGB } from 'color-convert/conversions';

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);
const h = hlGroupManager.group.bind(hlGroupManager);
const gitChangedColor: RGB = [156, 190, 252];

export const gitChanged = h(
  'GitChanged',
  `ctermfg=${convert.rgb.ansi256(gitChangedColor)} guifg=#${convert.rgb.hex(gitChangedColor)}`,
);

export const gitHighlights = {
    gitAdded: hl('GitAdded', gitChanged.group),
    gitMixed: hl('GitMixed', gitChanged.group),
    gitModified: hl('GitModified', gitChanged.group),
    gitUnmodified: hl('GitUnmodified', gitChanged.group),
    gitDeleted: hl('GitDeleted', gitChanged.group),
    gitRenamed: hl('GitRenamed', gitChanged.group),
    gitCopied: hl('GitCopied', gitChanged.group),
    gitUnmerged: hl('GitUnmerged', gitChanged.group),
    gitUntracked: hl('GitUntracked', gitChanged.group),
    gitIgnored: hl('GitIgnored', gitChanged.group),
};
