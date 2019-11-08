import { workspace } from 'coc.nvim';
import { execNotifyBlock } from '../util';

export type HighlightCommand = {
  group: string;
  commands: string[];
  markerID: number;
};

export type HighlightColumnHideCommand = {
  markerID: number;
  hide: () => Promise<void>;
  show: () => Promise<void>;
};

class HighlightManager {
  static maxMarkerID = 0;

  nvim = workspace.nvim;
  highlightCommands: string[] = [];

  createMarkerID() {
    HighlightManager.maxMarkerID += 1;
    return HighlightManager.maxMarkerID;
  }

  hlColumnHide(groupName: string): HighlightColumnHideCommand {
    const group = `CocExplorerColumn${groupName}`;
    const markerID = this.createMarkerID();
    let isInited = false;
    const hide = async () => {
      await execNotifyBlock(() => {
        if (isInited) {
          this.nvim.command(`silent syntax clear ${group}`, true);
        }
        this.nvim.command(
          `syntax match ${group} conceal /\\V<${markerID}|\\.\\*|${markerID}>/`,
          true,
        );
      }).catch();
      isInited = true;
    };
    const show = async () => {
      await execNotifyBlock(() => {
        if (isInited) {
          this.nvim.command(`silent syntax clear ${group}`, true);
        }
        this.nvim.command(`syntax match ${group} conceal /\\V<${markerID}|\\||${markerID}>/`, true);
      }).catch();
      isInited = true;
    };
    return {
      markerID,
      hide,
      show,
    };
  }

  hlLinkGroupCommand(groupName: string, targetGroup: string): HighlightCommand {
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

  hlGroupCommand(groupName: string, hlArgs: string): HighlightCommand {
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
