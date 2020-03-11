import { workspace } from 'coc.nvim';

const nvim = workspace.nvim;

export async function execNotifyBlock(block: () => void | Promise<void>, notify = false) {
  if (!notify) {
    nvim.pauseNotification();
  }
  try {
    await block();
    if (!notify) {
      const result = await nvim.resumeNotification();
      return result;
    }
  } catch (error) {
    if (!notify) {
      await nvim.resumeNotification();
    }
    throw error;
  }
}
