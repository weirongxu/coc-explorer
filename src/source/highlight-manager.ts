import { workspace } from 'coc.nvim';
import { execNotifyBlock, max, min, skipOnEventsByWinnrs } from '../util';
import { ExplorerSource } from './source';
import { range } from 'lodash';

// Highlight types
export interface HighlightPosition {
  group: string;
  start: number;
  size: number;
}

export interface HighlightPositionWithLine extends HighlightPosition {
  line: number;
}

export interface HighlightConcealablePosition {
  concealable: HighlightConcealableCommand;
  start: number;
  size: number;
}

export interface HighlightConcealablePositionWithLine extends HighlightConcealablePosition {
  line: number;
}

export type HighlightCommand = {
  group: string;
  commands: string[];
};

export type HighlightConcealableCommand = {
  group: string;
  source: ExplorerSource<any>;
  visible: boolean;
  hide: () => void;
  show: () => void;
};

class HighlightManager {
  nvim = workspace.nvim;
  highlights: HighlightCommand[] = [];

  concealable(group: string) {
    return (source: ExplorerSource<any>): HighlightConcealableCommand => ({
      group,
      source,
      visible: true,
      show() {
        this.visible = true;
      },
      hide() {
        this.visible = false;
      },
    });
  }

  async executeConcealableHighlight(explorer: Explorer, { isNotify = false }) {
    // XXX disable
    // const { nvim } = this;
    //
    // const [topLine, lines] = (await nvim.eval('[line("w0"), &lines]')) as [number, number];
    // const startIndex = max([topLine - lines - 1, 0]);
    // const endIndex = topLine + lines * 2;
    // const concealHighlightPositions: HighlightConcealablePositionWithLine[] = [];
    // for (const source of explorer.sources) {
    //   const sourceStartIndex = max([startIndex - source.startLineIndex, 0]);
    //   const sourceEndIndex = min([endIndex - source.startLineIndex, source.height]);
    //   if (sourceStartIndex == source.height) {
    //     continue;
    //   }
    //   if (sourceEndIndex == 0) {
    //     continue;
    //   }
    //   const nodes = source.flattenedNodes.slice(sourceStartIndex, sourceEndIndex);
    //   for (let i = 0; i < nodes.length; i++) {
    //     const line = source.startLineIndex + sourceStartIndex + i;
    //     const node = nodes[i];
    //     if (node.concealHighlightPositions) {
    //       for (const conceal of node.concealHighlightPositions) {
    //         if (!conceal.concealable.visible) {
    //           concealHighlightPositions.push({
    //             ...conceal,
    //             line,
    //           });
    //         }
    //       }
    //     }
    //   }
    // }
    // const winnr = await explorer.winnr;
    //
    // if (winnr === null) {
    //   return;
    // }
    //
    // const storeWinnr = (await nvim.call('winnr')) as number;
    // const jumpWin = storeWinnr !== winnr;
    //
    // if (jumpWin) {
    //   await skipOnEventsByWinnrs([winnr!, storeWinnr]);
    // }
    //
    // await execNotifyBlock(async () => {
    //   if (jumpWin) {
    //     nvim.command(`${winnr}wincmd w`, true);
    //   }
    //   this.nvim.call(
    //     'coc_explorer#matchdelete_by_ids',
    //     [range(explorer.concealMatchStartId, explorer.concealMatchEndId)],
    //     true,
    //   );
    //   explorer.concealMatchEndId = explorer.concealMatchStartId;
    //
    //   for (const conceal of concealHighlightPositions) {
    //     this.nvim.call(
    //       'matchaddpos',
    //       [
    //         'Conceal',
    //         [[conceal.line + 1, conceal.start + 1, conceal.size]],
    //         100,
    //         explorer.concealMatchEndId,
    //         { conceal: true },
    //       ],
    //       true,
    //     );
    //     explorer.concealMatchEndId += 1;
    //   }
    //
    //   if (jumpWin) {
    //     nvim.command(`${storeWinnr}wincmd w`, true);
    //   }
    // }, isNotify);
  }

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
