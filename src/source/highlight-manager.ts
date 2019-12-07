import { workspace } from 'coc.nvim';
import { execNotifyBlock } from '../util';
import { ExplorerSource } from './source';

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
  hide: (source: ExplorerSource<any>) => Promise<void>;
  show: (source: ExplorerSource<any>) => Promise<void>;
};

class HighlightManager {
  static maxMarkerID = 0;

  nvim = workspace.nvim;
  highlightCommands: string[] = [];

  createMarkerID() {
    HighlightManager.maxMarkerID += 1;
    return HighlightManager.maxMarkerID;
  }

  concealable(groupName: string): HighlightConcealable {
    const group = `CocExplorerConcealable${groupName}`;
    const markerID = this.createMarkerID();
    const { nvim } = this;
    let isInited = false;
    let isShown = false;
    const hide = async (source: ExplorerSource<any>) => {
      if (!isShown && isInited) {
        return;
      }
      const winnr = await source.explorer.winnr;
      if (winnr) {
        const storeWinnr = await nvim.call('winnr');
        await execNotifyBlock(() => {
          nvim.command(`${winnr}wincmd w`, true);
          if (isInited) {
            nvim.command(`silent syntax clear ${group}`, true);
          }
          nvim.command(
            `syntax match ${group} conceal /\\V${HlEscapeCode.left(
              markerID,
            )}\\.\\*${HlEscapeCode.right(markerID)}/`,
            true,
          );
          nvim.command(`${storeWinnr}wincmd w`, true);
        });
        isShown = false;
        isInited = true;
      }
    };
    const show = async (source: ExplorerSource<any>) => {
      if (isShown && isInited) {
        return;
      }
      const winnr = await source.explorer.winnr;
      if (winnr) {
        const storeWinnr = await nvim.call('winnr');
        await execNotifyBlock(() => {
          nvim.command(`${winnr}wincmd w`, true);
          if (isInited) {
            nvim.command(`silent syntax clear ${group}`, true);
          }
          nvim.command(
            `syntax match ${group} conceal /\\V${HlEscapeCode.left(
              markerID,
            )}\\|${HlEscapeCode.right(markerID)}/`,
            true,
          );
          nvim.command(`${storeWinnr}wincmd w`, true);
        });
        isShown = true;
        isInited = true;
      }
    };
    return {
      markerID,
      hide,
      show,
    };
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
    this.highlightCommands.push(...commands);
    return {
      group,
      commands,
      markerID,
    };
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
    this.highlightCommands.push(...commands);
    return {
      group,
      commands,
      markerID,
    };
  }

  async registerHighlightSyntax(notify = false) {
    await execNotifyBlock(async () => {
      this.nvim.call('coc_explorer#register_syntax_highlights', [this.highlightCommands], true);
    }, notify);
  }
}

export const hlGroupManager = new HighlightManager();
