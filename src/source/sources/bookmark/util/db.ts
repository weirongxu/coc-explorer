// modified from https://github.com/neoclide/coc.nvim/blob/master/src/model/db.ts
import path from 'path';
import { statAsync, writeFileAsync, readFileAsync, mkdirAsync } from './fs';

export default class BookmarkDB {
  constructor(private readonly filepath: string) { }

  public async load(): Promise<any> {
    const dir = path.dirname(this.filepath);
    const stat = await statAsync(dir);
    if (!stat || !stat.isDirectory()) {
      return {};
    }
    try {
      const content = await readFileAsync(this.filepath);
      return JSON.parse(content.trim());
    } catch {
      return {};
    }
  }

  public async fetch(key: string): Promise<any> {
    let obj = await this.load();
    if (!key) {
      return obj;
    };
    const parts = key.split('.');
    for (const part of parts) {
      if (typeof obj[part] === 'undefined') {
        return undefined;
      }
      obj = obj[part];
    }
    return obj;
  }

  public async exists(key: string): Promise<boolean> {
    let obj = await this.load();
    const parts = key.split('.');
    for (const part of parts) {
      if (typeof obj[part] === 'undefined') {
        return false;
      }
      obj = obj[part];
    }
    return true;
  }

  public async push(key: string, data: any): Promise<void> {
    const origin = await this.load() || {};
    let obj = origin;
    const parts = key.split('.');
    const len = parts.length;
    if (obj === null) {
      const dir = path.dirname(this.filepath);
      await mkdirAsync(dir);
      obj = origin;
    }
    for (let i = 0; i < len; i++) {
      const key = parts[i];
      if (i === len - 1) {
        obj[key] = data;
        await writeFileAsync(this.filepath, JSON.stringify(origin, null, 2));
        break;
      }
      if (typeof obj[key] === 'undefined') {
        obj[key] = {};
        obj = obj[key];
      } else {
        obj = obj[key];
      }
    }
  }

  public async delete(key: string): Promise<void> {
    let obj = await this.load();
    const origin = obj;
    const parts = key.split('.');
    const len = parts.length;
    for (let i = 0; i < len; i++) {
      if (typeof obj[parts[i]] === 'undefined') {
        break;
      }
      if (i === len - 1) {
        delete obj[parts[i]];
        await writeFileAsync(this.filepath, JSON.stringify(origin, null, 2));
        break;
      }
      obj = obj[parts[i]];
    }
  }

  public async clear(): Promise<void> {
    const stat = await statAsync(this.filepath);
    if (!stat || !stat.isFile()) {
      return;
    }
    await writeFileAsync(this.filepath, '{}');
  }
}
