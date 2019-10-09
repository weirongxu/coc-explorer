import { BasicList, Neovim, workspace } from 'coc.nvim';
import { onError } from '../logger';

interface DriveItem {
  name: string;
  callback: (drive: string) => void | Promise<void>;
}

export class ExplorerDrives extends BasicList {
  readonly defaultAction = 'do';
  readonly name = 'explorerActions';
  private explorerDrives: DriveItem[] = [];

  constructor(nvim: Neovim) {
    super(nvim);

    this.addAction('do', (item) => {
      new Promise(async (resolve) => {
        await item.data.callback(item.data.drive);
        resolve();
      }).catch(onError);
    });
  }

  setExplorerDrives(drives: DriveItem[]) {
    this.explorerDrives = drives;
  }

  async loadItems() {
    return this.explorerDrives.map((drive) => ({
      label: `${drive.name} - change to ${drive.name}/`,
      data: {
        drive: drive.name,
        callback: drive.callback,
      }
    }));
  }

  public doHighlight() {
    const { nvim } = this;
    nvim.pauseNotification();
    nvim.command('syntax match CocExplorerDriveName /\\v^[\\w:]+/', true);
    nvim.command('syntax match CocExplorerDriveDescription /\\v - .+/', true);
    nvim.command('highlight default link CocExplorerDriveName PreProc', true);
    nvim.command('highlight default link CocExplorerDriveDescription Comment', true);
    nvim.resumeNotification().catch(onError);
  }
}

export const explorerDrives = new ExplorerDrives(workspace.nvim);
