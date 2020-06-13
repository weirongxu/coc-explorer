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

  async createSource(name: string, explorer: Explorer, expanded: boolean) {
    if (!this.registeredSources[name]) {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(`explorer source(${name}) not found`, 'error');
      return;
    }
    if (!(await this.registeredSources[name].enabled)) {
      return;
    }
    const source = new this.registeredSources[name](name, explorer);
    source.bootInit(expanded);
    return source;
  }
}

export const sourceManager = new SourceManager();
