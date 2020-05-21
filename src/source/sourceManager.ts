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

  createSource(name: string, explorer: Explorer, expanded: boolean) {
    if (this.registeredSources[name]) {
      const source = new this.registeredSources[name](name, explorer);
      source.bootInit(expanded);
      return source;
    } else {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(`explorer source(${name}) not found`, 'error');
      return;
    }
  }
}

export const sourceManager = new SourceManager();
