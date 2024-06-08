import { workspace, type Buffer, type Window } from 'coc.nvim';

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
  constructor(
    public name: string,
    public buffer: Buffer,
  ) {
    super(name);
  }

  async read(): Promise<object> {
    return (
      ((await this.buffer.getVar(variableName)) as object | undefined) || {}
    );
  }

  async write(obj: object) {
    await this.buffer.setVar(variableName, obj);
  }
}

export class WindowContextVars<T> extends ContextVars<T> {
  constructor(
    public name: string,
    public win: Window,
  ) {
    super(name);
  }

  async read(): Promise<object> {
    return ((await this.win.getVar(variableName)) as object | undefined) || {};
  }

  async write(obj: object) {
    await this.win.setVar(variableName, obj);
  }
}

export class GlobalContextVars<T> extends ContextVars<T> {
  nvim = workspace.nvim;
  async read(): Promise<object> {
    return ((await this.nvim.getVar(variableName)) as object | undefined) ?? {};
  }

  async write(obj: object) {
    await this.nvim.setVar(variableName, obj);
  }
}
