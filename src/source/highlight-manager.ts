import { workspace } from 'coc.nvim';
import { execNotifyBlock } from '../util';

export type HighlightCommand = {
  group: string;
  command: string;
  markerID: number;
};

class HighlightManager {
  static maxMarkerID = 0;

  nvim = workspace.nvim;
  highlightCommands: HighlightCommand[] = [];

  createMarkerID() {
    HighlightManager.maxMarkerID += 1;
    return HighlightManager.maxMarkerID;
  }

  hlLinkGroupCommand(groupName: string, targetGroup: string): HighlightCommand {
    const group = `CocExplorer${groupName}`;
    return {
      group,
      command: `highlight default link ${group} ${targetGroup}`,
      markerID: this.createMarkerID(),
    };
  }

  hlGroupCommand(groupName: string, hlArgs: string): HighlightCommand {
    const group = `CocExplorer${groupName}`;
    return {
      group,
      command: `highlight default ${group} ${hlArgs}`,
      markerID: this.createMarkerID(),
    };
  }

  register(highlights: HighlightCommand[]): void;
  register(highlights: Record<string, HighlightCommand>): void;
  register(highlights: HighlightCommand): void;
  register(highlights: HighlightCommand | HighlightCommand[] | Record<string, HighlightCommand>) {
    if (Array.isArray(highlights)) {
      this.highlightCommands.push(...highlights);
    } else if ('group' in highlights && typeof highlights.group === 'string') {
      this.highlightCommands.push(highlights as HighlightCommand);
    } else {
      this.register(Object.values(highlights));
    }
  }

  async registerHighlightSyntax(notify = false) {
    await execNotifyBlock(async () => {
      this.nvim.call('coc_explorer#register_syntax_highlights', [this.highlightCommands], true);
    }, notify);
  }
}

export const hlGroupManager = new HighlightManager();
