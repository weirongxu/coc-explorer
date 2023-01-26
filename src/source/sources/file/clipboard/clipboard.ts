import type { ExplorerManager } from '../../../../explorerManager';
import type { ClipboardStorage } from './base';
import { GlobalStateStorage } from './global-state';

export function getClipboard(
  explorerManager: ExplorerManager,
): ClipboardStorage {
  return new GlobalStateStorage(explorerManager);
}
