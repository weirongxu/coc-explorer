import { workspace } from 'coc.nvim';
import { execNotifyBlock } from '../util/neovim-notify';

export type HighlightCommand = {
  group: string;
  command: string;
};

class HighlightManager {
  nvim = workspace.nvim;
  highlightCommands: HighlightCommand[] = [];

  hlLinkGroupCommand(groupName: string, targetGroup: string): HighlightCommand {
    const group = `CocExplorer${groupName}`;
    return {
      group,
      command: `highlight default link ${group} ${targetGroup}`,
    };
  }

  hlGroupCommand(groupName: string, hlArgs: string): HighlightCommand {
    const group = `CocExplorer${groupName}`;
    return {
      group,
      command: `highlight default ${group} ${hlArgs}`,
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

  async executeCommands(notify = false) {
    await execNotifyBlock(() => {
      this.highlightCommands.forEach((h) => {
        this.nvim.command(h.command, true);
      });
    }, notify);
  }
}

export const hlGroupManager = new HighlightManager();
