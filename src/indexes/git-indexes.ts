import { BaseIndexes } from '../indexes-manager';

export class GitIndexes extends BaseIndexes<{ line: number; path: string }> {
  updateStatus() {
  }
}
