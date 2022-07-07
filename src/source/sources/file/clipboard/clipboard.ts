import { ExplorerManager } from '../../../../explorerManager';
import { ClipboardStorage } from './base';
import { GlobalStateStorage } from './global-state';

export function getClipboard(
  explorerManager: ExplorerManager,
): ClipboardStorage {
  return new GlobalStateStorage(explorerManager);
}
