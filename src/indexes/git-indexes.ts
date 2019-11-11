import { GitMixedStatus } from '../git-manager';
import { FileSource, FileNode } from '../source/sources/file/file-source';
import { BaseIndexes } from './base-indexes';

export class GitIndexes extends BaseIndexes {
  prevStatuses: Record<string, GitMixedStatus> = {};

  constructor(public fileSource: FileSource) {
    super();
  }

  private statusEqual(a: GitMixedStatus, b: GitMixedStatus) {
    return a.x === b.x && a.y === b.y;
  }

  async updateStatus(statuses: Record<string, GitMixedStatus>) {
    const updatePaths: Set<string> = new Set();
    for (const [path, status] of Object.entries(statuses)) {
      if (path in this.prevStatuses) {
        if (this.statusEqual(this.prevStatuses[path], status)) {
          continue;
        }
        delete this.prevStatuses[path];
      }
      updatePaths.add(path);
    }
    for (const path of Object.keys(this.prevStatuses)) {
      updatePaths.add(path);
    }
    const updateNodes = Array.from(updatePaths)
      .map((path) => {
        return this.fileSource.flattenedNodes.find((node) => node.fullpath === path);
      })
      .filter((node): node is FileNode => !!node);
    await this.fileSource.renderNodes(updateNodes);
    this.updateNodes(updateNodes);
    this.prevStatuses = statuses;
  }
}
