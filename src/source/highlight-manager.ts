import { workspace } from 'coc.nvim';
import { execNotifyBlock, skipOnBufEnter } from '../util';

export const HlEscapeCode = {
  left: (s: string | number) => HlEscapeCode.leftBegin + s + HlEscapeCode.leftEnd,
  leftBegin: '\x01',
  leftEnd: '\x02',
  right: (s: string | number) => HlEscapeCode.rightBegin + s + HlEscapeCode.rightEnd,
  rightBegin: '\x03',
  rightEnd: '\x04',
};

export type Hightlight = {
  group: string;
  commands: string[];
  markerID: number;
};

export type HighlightConcealable = {
  markerID: number;
  requestHide: () => void;
  requestShow: () => void;
};

class HighlightManager {
  static maxMarkerID = 0;

  nvim = workspace.nvim;
  highlights: Hightlight[] = [];
  concealableHighlights: HighlightConcealable[] = [];

  private requestedConcealableToggle: Map<string, (notify: boolean) => Promise<void>> = new Map();

  createMarkerID() {
    HighlightManager.maxMarkerID += 1;
    return HighlightManager.maxMarkerID;
  }

  concealable(groupName: string): HighlightConcealable {
    const group = `CocExplorerConcealable${groupName}`;
    const markerID = this.createMarkerID();
    const { nvim } = this;
    const hideCommand = `syntax match ${group} conceal /\\V${HlEscapeCode.left(
      markerID,
    )}\\.\\*${HlEscapeCode.right(markerID)}/`;
    const showCommand = `syntax match ${group} conceal /\\V${HlEscapeCode.left(
      markerID,
    )}\\|${HlEscapeCode.right(markerID)}/`;
    const hide = async (notify = false) => {
      await execNotifyBlock(() => {
        nvim.command(`silent! syntax clear ${group}`, true);
        nvim.command(hideCommand, true);
      }, notify);
    };
    const show = async (notify = false) => {
      await execNotifyBlock(() => {
        nvim.command(`silent! syntax clear ${group}`, true);
        nvim.command(showCommand, true);
      }, notify);
    };

    const concealable: HighlightConcealable = {
      markerID,
      requestHide: () => this.requestedConcealableToggle.set(group, hide),
      requestShow: () => this.requestedConcealableToggle.set(group, show),
    };
    this.concealableHighlights.push(concealable);
    return concealable;
  }

  async emitRequestConcealableToggle(explorer: Explorer, notify = false) {
    if (this.requestedConcealableToggle.size > 0) {
      const { nvim } = this;
      const { mode } = await nvim.mode;
      const winnr = await explorer.winnr;
      if (winnr && mode === 'n') {
        await execNotifyBlock(async () => {
          const storeWinnr = await nvim.call('winnr');
          const jumpWin = storeWinnr !== winnr;
          if (jumpWin) {
            skipOnBufEnter(
              (await nvim.eval(`[winbufnr(${winnr}), winbufnr(${storeWinnr})]`)) as [
                number,
                number,
              ],
            );
            nvim.command(`${winnr}wincmd w`, true);
          }
          for (const toggle of this.requestedConcealableToggle.values()) {
            await toggle(true);
          }
          if (jumpWin) {
            nvim.command(`${storeWinnr}wincmd w`, true);
          }
          this.requestedConcealableToggle.clear();
        }, notify);
      }
    }
  }

  linkGroup(groupName: string, targetGroup: string): Hightlight {
    const group = `CocExplorer${groupName}`;
    const markerID = this.createMarkerID();
    const commands = [
      `syntax region ${group} concealends matchgroup=${group}Marker start=/\\V${HlEscapeCode.left(
        markerID,
      )}/ end=/\\V${HlEscapeCode.right(markerID)}/`,
      `highlight default link ${group} ${targetGroup}`,
    ];
    const highlight = {
      group,
      commands,
      markerID,
    };
    this.highlights.push(highlight);
    return highlight;
  }

  group(groupName: string, hlArgs: string): Hightlight {
    const group = `CocExplorer${groupName}`;
    const markerID = this.createMarkerID();
    const commands = [
      `syntax region ${group} concealends matchgroup=${group}Marker start=/\\V${HlEscapeCode.left(
        markerID,
      )}/ end=/\\V${HlEscapeCode.right(markerID)}/`,
      `highlight default ${group} ${hlArgs}`,
    ];
    const highlight = {
      group,
      commands,
      markerID,
    };
    this.highlights.push(highlight);
    return highlight;
  }

  async executeHighlightSyntax(notify = false) {
    await execNotifyBlock(async () => {
      const commands: string[] = [];
      for (const highlight of this.highlights) {
        this.nvim.command(`silent! syntax clear ${highlight.group}`, true);
        commands.push(...highlight.commands);
      }
      this.nvim.call('coc_explorer#execute_syntax_highlights', [commands], true);
    }, notify);
  }
}

export const hlGroupManager = new HighlightManager();

import { Explorer } from '../explorer';
