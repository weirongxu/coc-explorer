import { Disposable, workspace } from 'coc.nvim';
import { ExplorerSourceClass } from './source';
import { Explorer } from '../explorer';

class SourceManager {
  registeredSources: Record<string, ExplorerSourceClass> = {};

  constructor() {}

  registerSource(name: string, source: ExplorerSourceClass) {
    this.registeredSources[name] = source;
    return Disposable.create(() => {
      delete this.registeredSources[name];
    });
  }

  async enabled(name: string) {
    if (!this.registeredSources[name]) {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(`explorer source(${name}) not found`, 'error');
      return false;
    }
    return await this.registeredSources[name].enabled;
  }

  createSource(name: string, explorer: Explorer, expanded: boolean) {
    if (!this.registeredSources[name]) {
      throw new Error(`explorer source(${name}) not found`);
    }
    const source = new this.registeredSources[name](name, explorer);
    source.bootInit(expanded);
    return source;
  }
}

export const sourceManager = new SourceManager();
