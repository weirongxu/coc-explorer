import { workspace } from 'coc.nvim';
import { execNotifyBlock } from '../util';
import { Explorer } from '../explorer';

export type Hightlight = {
  group: string;
  commands: string[];
  markerID: number;
};

export type HighlightConcealable = {
  markerID: number;
  hide: (explorer: Explorer) => Promise<void>;
  show: (explorer: Explorer) => Promise<void>;
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
    const hide = async (explorer: Explorer) => {
      const winnr = await explorer.winnr;
      if (winnr) {
        const storeWinnr = await nvim.call('winnr');
        await execNotifyBlock(() => {
          nvim.command(`${winnr}wincmd w`, true);
          if (isInited) {
            nvim.command(`silent syntax clear ${group}`, true);
          }
          nvim.command(`syntax match ${group} conceal /\\V<${markerID}|\\.\\*|${markerID}>/`, true);
          nvim.command(`${storeWinnr}wincmd w`, true);
        });
        isInited = true;
      }
    };
    const show = async (explorer: Explorer) => {
      const winnr = await explorer.winnr;
      if (winnr) {
        const storeWinnr = await nvim.call('winnr');
        await execNotifyBlock(() => {
          nvim.command(`${winnr}wincmd w`, true);
          if (isInited) {
            nvim.command(`silent syntax clear ${group}`, true);
          }
          nvim.command(`syntax match ${group} conceal /\\V<${markerID}|\\||${markerID}>/`, true);
          nvim.command(`${storeWinnr}wincmd w`, true);
        });
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
      `syntax region ${group} concealends matchgroup=${group}Marker start=/\\V<${markerID}|/ end=/\\V|${markerID}>/`,
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
      `syntax region ${group} concealends matchgroup=${group}Marker start=/\\V<${markerID}|/ end=/\\V|${markerID}>/`,
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
