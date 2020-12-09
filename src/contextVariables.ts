import { workspace } from 'coc.nvim';
import { Explorer } from './explorer';

const variableName = 'coc_explorer_context';

export abstract class ContextVars<T> {
  constructor(public name: string) {}

  abstract read(): Promise<object>;

  abstract write(obj: object): Promise<void>;

  async set(value: T | undefined) {
    const obj = await this.read();
    if (value === undefined) {
      Reflect.deleteProperty(obj, this.name);
    } else {
      Reflect.set(obj, this.name, value);
    }
    await this.write(obj);
  }

  async get(): Promise<T | undefined> {
    const obj = await this.read();
    return Reflect.get(obj, this.name);
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

export class WindowContextVars<T> extends ContextVars<T> {
  constructor(public name: string, public explorer: Explorer) {
    super(name);
  }

  async read(): Promise<object> {
    const win = await this.explorer.win;
    return ((await win?.getVar(variableName)) as object) || {};
  }

  async write(obj: object) {
    const win = await this.explorer.win;
    await win?.setVar(variableName, obj);
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
