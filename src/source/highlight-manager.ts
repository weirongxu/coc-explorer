import { workspace } from 'coc.nvim';
import { execNotifyBlock } from '../util';

// Highlight types
export interface HighlightPosition {
  group: string;
  start: number;
  size: number;
}

export interface HighlightPositionWithLine extends HighlightPosition {
  line: number;
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

  clearHighlights(explorer: Explorer, hlSrcId: number, lineStart?: number, lineEnd?: number) {
    explorer.buffer.clearNamespace(hlSrcId, lineStart, lineEnd);
  }

  async executeHighlightsNotify(
    explorer: Explorer,
    hlSrcId: number,
    highlights: HighlightPositionWithLine[],
  ) {
    await execNotifyBlock(async () => {
      for (const hl of highlights) {
        await explorer.buffer.addHighlight({
          srcId: hlSrcId,
          hlGroup: hl.group,
          line: hl.line,
          colStart: hl.start,
          colEnd: hl.start + hl.size,
        });
      }
    });
  }

  async executeHighlightSyntax(notify = false) {
    await execNotifyBlock(async () => {
      const commands: string[] = [];
      for (const highlight of this.highlights) {
        this.nvim.command(`silent! syntax clear ${highlight.group}`, true);
        commands.push(...highlight.commands);
      }
      this.nvim.call('coc_explorer#execute_commands', [commands], true);
    }, notify);
  }
}

export const hlGroupManager = new HighlightManager();

import { Explorer } from '../explorer';
