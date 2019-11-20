import { workspace } from 'coc.nvim';

const nvim = workspace.nvim;

export async function execNotifyBlock(block: () => void | Promise<void>, notify = false) {
  if (!notify) {
    nvim.pauseNotification();
  }
  await block();
  if (!notify) {
    return await nvim.resumeNotification();
  }
}
