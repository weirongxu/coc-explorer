import { ExplorerManager } from '../../../../explorerManager';

export type ClipboardContent = {
  type: 'none' | 'copy' | 'cut';
  fullpaths: string[];
};

export abstract class ClipboardStorage {
  constructor(protected explorerManager: ExplorerManager) {}

  abstract copyFiles(fullpaths: string[]): Promise<void>;

  abstract cutFiles(fullpaths: string[]): Promise<void>;

  abstract getFiles(): Promise<ClipboardContent>;

  abstract clear(): Promise<void>;
}
