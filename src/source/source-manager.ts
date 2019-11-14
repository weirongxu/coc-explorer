import { Disposable, workspace } from 'coc.nvim';
import { ExplorerSource } from './source';
import { Explorer } from '../explorer';

type ExplorerSourceClass = {
  new (name: string, explorer: Explorer, expanded: boolean): ExplorerSource<any>;
};

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
      return new this.registeredSources[name](name, explorer, expanded);
    } else {
      // tslint:disable-next-line: ban
      workspace.showMessage(`explorer source(${name}) not found`, 'error');
      return null;
    }
  }
}

export const sourceManager = new SourceManager();
