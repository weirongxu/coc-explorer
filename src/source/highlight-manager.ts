import { workspace } from 'coc.nvim';
import { execNotifyBlock, skipOnBufEnter, enableDebug } from '../util';

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
  concealableHighlightsVisible: Map<string, boolean> = new Map();
  concealableHighlights: HighlightConcealable[] = [];

  private requestedConcealableQueue: Map<
    string,
    {
      handler: (notify: boolean) => Promise<void>;
      action: 'show' | 'hide';
    }
  > = new Map();

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
      requestShow: () =>
        this.requestedConcealableQueue.set(group, { action: 'show', handler: show }),
      requestHide: () =>
        this.requestedConcealableQueue.set(group, { action: 'hide', handler: hide }),
    };
    this.concealableHighlights.push(concealable);
    return concealable;
  }

  async emitRequestedConcealableRender(explorer: Explorer, { notify = false, force = false } = {}) {
    if (this.requestedConcealableQueue.size <= 0) {
      return;
    }

    const { nvim } = this;
    const { mode } = await nvim.mode;
    const winnr = await explorer.winnr;

    const storeWinnr = await nvim.call('winnr');
    const jumpWin = storeWinnr !== winnr;

    const requestedRenderList = Array.from(this.requestedConcealableQueue).filter(
      ([group, value]) => {
        if (force || !this.concealableHighlightsVisible.has(group)) {
          return true;
        }
        const visible = this.concealableHighlightsVisible.get(group)!;
        return (value.action === 'show' && !visible) || (value.action === 'hide' && visible);
      },
    );
    this.requestedConcealableQueue.clear();

    if (!requestedRenderList.length) {
      return;
    }

    if (winnr && mode === 'n') {
      if (enableDebug) {
        // tslint:disable-next-line: ban
        workspace.showMessage(
          `Concealable Render ${requestedRenderList.length} (${Array.from(
            requestedRenderList.map(([group]) => group),
          ).join(',')})`,
          'more',
        );
      }
      await execNotifyBlock(async () => {
        if (jumpWin) {
          skipOnBufEnter(
            (await nvim.eval(`[winbufnr(${winnr}), winbufnr(${storeWinnr})]`)) as [number, number],
          );
          nvim.command(`${winnr}wincmd w`, true);
        }
        for (const [group, value] of requestedRenderList) {
          this.concealableHighlightsVisible.set(group, value.action === 'show');
          await value.handler(true);
        }
        if (jumpWin) {
          nvim.command(`${storeWinnr}wincmd w`, true);
        }
      }, notify);
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
