import { Disposable } from 'coc.nvim';
import type { ExplorerSourceClass } from './source';
import type { Explorer } from '../explorer';

class SourceManager {
  registeredSources: Record<string, ExplorerSourceClass | undefined> = {};

  constructor() {}

  registerSource(name: string, source: ExplorerSourceClass) {
    this.registeredSources[name] = source;
    return Disposable.create(() => {
      delete this.registeredSources[name];
    });
  }

  async enabled(name: string) {
    const sourceClass = this.registeredSources[name];
    if (!sourceClass) {
      return false;
    }
    return await sourceClass.enabled;
  }

  createSource(name: string, explorer: Explorer, expanded: boolean) {
    const sourceClass = this.registeredSources[name];
    if (!sourceClass) {
      throw new Error(`explorer source(${name}) not found`);
    }
    const source = new sourceClass(name, explorer);
    source.bootInit(expanded);
    return source;
  }
}

export const sourceManager = new SourceManager();
