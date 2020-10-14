import { BasicList, Neovim, workspace } from 'coc.nvim';
import { onError } from '../util';

interface DriveItem {
  name: string;
  callback: (drive: string) => void | Promise<void>;
}

export class DriveList extends BasicList {
  readonly defaultAction = 'do';
  readonly name = 'explorerDrives';
  private explorerDrives: DriveItem[] = [];

  constructor(nvim: Neovim) {
    super(nvim);

    this.addAction('do', async (item) => {
      await item.data.callback(item.data.drive);
    });
  }

  setExplorerDrives(drives: DriveItem[]) {
    this.explorerDrives = drives;
  }

  async loadItems() {
    return this.explorerDrives.map((drive) => ({
      label: drive.name,
      data: {
        drive: drive.name,
        callback: drive.callback,
      },
    }));
  }

  doHighlight() {
    const { nvim } = this;
    nvim.pauseNotification();
    nvim.command('syntax match CocExplorerDriveName /\\v^[\\w:]+/', true);
    nvim.command('highlight default link CocExplorerDriveName PreProc', true);
    nvim.resumeNotification().catch(onError);
  }
}

export const driveList = new DriveList(workspace.nvim);
