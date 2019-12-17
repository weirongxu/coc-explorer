import { workspace } from 'coc.nvim';
import { execNotifyBlock } from '../util';

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
  hide: (source: Explorer | ExplorerSource<any>, notify?: boolean) => Promise<void>;
  show: (source: Explorer | ExplorerSource<any>, notify?: boolean) => Promise<void>;
};

class HighlightManager {
  static maxMarkerID = 0;

  nvim = workspace.nvim;
  highlights: Hightlight[] = [];
  highlightConcealableList: HighlightConcealable[] = [];

  createMarkerID() {
    HighlightManager.maxMarkerID += 1;
    return HighlightManager.maxMarkerID;
  }

  concealable(groupName: string): HighlightConcealable {
    const group = `CocExplorerConcealable${groupName}`;
    const markerID = this.createMarkerID();
    const { nvim } = this;
    const existsSyntax = async () => {
      const result = (await nvim.eval(`execute(':syntax list ${group}')`).catch(() => false)) as
        | string
        | boolean;
      return result !== false;
    };
    const getWinnr = async (explorerOrSource: Explorer | ExplorerSource<any>) => {
      return explorerOrSource instanceof Explorer
        ? explorerOrSource.winnr
        : explorerOrSource.explorer.winnr;
    };
    const hide = async (explorerOrSource: Explorer | ExplorerSource<any>, notify = false) => {
      const winnr = await getWinnr(explorerOrSource);
      if (winnr) {
        const storeWinnr = await nvim.call('winnr');
        await execNotifyBlock(async () => {
          nvim.command(`${winnr}wincmd w`, true);
          const existsSyntax_ = await existsSyntax();
          if (existsSyntax_) {
            nvim.command(`silent syntax clear ${group}`, true);
          }
          nvim.command(
            `syntax match ${group} conceal /\\V${HlEscapeCode.left(
              markerID,
            )}\\.\\*${HlEscapeCode.right(markerID)}/`,
            true,
          );
          nvim.command(`${storeWinnr}wincmd w`, true);
        }, notify);
      }
    };
    const show = async (explorerOrSource: Explorer | ExplorerSource<any>, notify = false) => {
      const winnr = await getWinnr(explorerOrSource);
      if (winnr) {
        const storeWinnr = await nvim.call('winnr');
        await execNotifyBlock(async () => {
          nvim.command(`${winnr}wincmd w`, true);
          const existsSyntax_ = await existsSyntax();
          if (existsSyntax_) {
            nvim.command(`silent syntax clear ${group}`, true);
          }
          nvim.command(
            `syntax match ${group} conceal /\\V${HlEscapeCode.left(
              markerID,
            )}\\|${HlEscapeCode.right(markerID)}/`,
            true,
          );
          nvim.command(`${storeWinnr}wincmd w`, true);
        }, notify);
      }
    };

    const concealable = {
      markerID,
      hide,
      show,
    };
    this.highlightConcealableList.push(concealable);
    return concealable;
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

  async executeHighlightSyntax(explorer: Explorer, notify = false) {
    await execNotifyBlock(async () => {
      const commands: string[] = [];
      for (const highlight of this.highlights) {
        this.nvim.command(`silent! syntax clear ${highlight.group}`, true);
        commands.push(...highlight.commands);
      }
      this.nvim.call('coc_explorer#execute_syntax_highlights', [commands], true);
      await Promise.all(
        this.highlightConcealableList.map((concealable) => concealable.hide(explorer, true)),
      );
    }, notify);
  }
}

export const hlGroupManager = new HighlightManager();

import { ExplorerSource } from './source';
import { Explorer } from '../explorer';
