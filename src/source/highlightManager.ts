import { workspace } from 'coc.nvim';

// Highlight types
export interface HighlightPosition {
  group: string;
  start: number;
  size: number;
}

export interface HighlightPositionWithLine extends HighlightPosition {
  lineIndex: number;
}

export type HighlightCommand = {
  group: string;
  commands: string[];
};

class HighlightManager {
  nvim = workspace.nvim;
  highlights: HighlightCommand[] = [];

  linkGroup(groupName: string, targetGroup: string): HighlightCommand {
    const group = `CocExplorer${groupName}`;
    const commands = [`highlight default link ${group} ${targetGroup}`];
    const highlight = {
      group,
      commands,
    };
    this.highlights.push(highlight);
    return highlight;
  }

  group(groupName: string, hlCommand: string): HighlightCommand {
    const group = `CocExplorer${groupName}`;
    const commands = [`highlight default ${group} ${hlCommand}`];
    const highlight = {
      group,
      commands,
    };
    this.highlights.push(highlight);
    return highlight;
  }

  clearHighlightsNotify(
    explorer: Explorer,
    hlSrcId: number,
    lineStart?: number,
    lineEnd?: number,
  ) {
    explorer.buffer.clearNamespace(hlSrcId, lineStart, lineEnd);
  }

  addHighlightsNotify(
    explorer: Explorer,
    hlSrcId: number,
    highlights: HighlightPositionWithLine[],
  ) {
    for (const hl of highlights) {
      if (hl.size === 0) {
        continue;
      }
      explorer.buffer
        .addHighlight({
          srcId: hlSrcId,
          hlGroup: hl.group,
          line: hl.lineIndex,
          colStart: hl.start,
          colEnd: hl.start + hl.size,
        })
        .catch(onError);
    }
  }

  addHighlightSyntaxNotify() {
    const commands: string[] = [];
    for (const highlight of this.highlights) {
      this.nvim.command(`silent! syntax clear ${highlight.group}`, true);
      commands.push(...highlight.commands);
    }
    this.nvim.call('coc_explorer#util#execute_commands', [commands], true);
  }
}

export const hlGroupManager = new HighlightManager();

import { Explorer } from '../explorer';
import { onError } from '../logger';
