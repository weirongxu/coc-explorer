import type { ExplorerManager } from '../../../../explorerManager';

export type ClipboardContent = {
  type: 'none' | 'copy' | 'cut';
  fullpaths: string[];
};

export abstract class ClipboardStorage {
  constructor(protected explorerManager: ExplorerManager) {}

  abstract setFiles(type: 'copy' | 'cut', fullpaths: string[]): Promise<void>;

  abstract getFiles(): Promise<ClipboardContent>;

  abstract clear(): Promise<void>;
}
