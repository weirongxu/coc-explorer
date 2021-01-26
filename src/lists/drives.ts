import { workspace } from 'coc.nvim';
import { logger } from '../util';
import { registerList } from './runner';

interface DriveItem {
  name: string;
  callback: (drive: string) => void | Promise<void>;
}

export const driveList = registerList<DriveItem[], DriveItem>({
  name: 'explorerDrives',
  defaultAction: 'do',
  async loadItems(drives) {
    return drives.map((drive) => ({
      label: drive.name,
      data: drive,
    }));
  },
  doHighlight() {
    const { nvim } = workspace;
    nvim.pauseNotification();
    nvim.command('syntax match CocExplorerDriveName /\\v^[\\w:]+/', true);
    nvim.command('highlight default link CocExplorerDriveName PreProc', true);
    nvim.resumeNotification().catch(logger.error);
  },
  init() {
    this.addAction('do', async ({ item }) => {
      await item.data.callback(item.data.name);
    });
  },
});
