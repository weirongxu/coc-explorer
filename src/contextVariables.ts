import { workspace } from 'coc.nvim';
import { Explorer } from './explorer';

const variableName = 'coc_explorer_context';

export abstract class ContextVars<T> {
  constructor(public name: string) {}

  abstract async read(): Promise<object>;

  abstract async write(obj: object): Promise<void>;

  async set(value: T | null) {
    const obj = await this.read();
    if (value === null) {
      Reflect.deleteProperty(obj, this.name);
    } else {
      Reflect.set(obj, this.name, value);
    }
    await this.write(obj);
  }

  async get(): Promise<T | null> {
    const obj = await this.read();
    return Reflect.get(obj, this.name) ?? null;
  }
}

export class BuffuerContextVars<T> extends ContextVars<T> {
  constructor(public name: string, public explorer: Explorer) {
    super(name);
  }

  async read(): Promise<object> {
    return ((await this.explorer.buffer.getVar(variableName)) as object) || {};
  }

  async write(obj: object) {
    await this.explorer.buffer.setVar(variableName, obj);
  }
}

export class GlobalContextVars<T> extends ContextVars<T> {
  nvim = workspace.nvim;
  async read(): Promise<object> {
    return ((await this.nvim.getVar(variableName)) as object) ?? {};
  }

  async write(obj: object) {
    await this.nvim.setVar(variableName, obj);
  }
}
