// modified from: https://github.com/neoclide/coc.nvim/blob/687af54a67e20d6bb1e1760f6e702fb751591157/src/__tests__/helper.ts

import { Buffer, Neovim, Window } from '@chemzqm/neovim';
import * as cp from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import pathLib from 'path';
import util from 'util';
import attach from 'coc.nvim/lib/attach';
import Document from 'coc.nvim/lib/model/document';
import Plugin from 'coc.nvim/lib/plugin';
import workspace from 'coc.nvim/lib/workspace';
import { v4 as uuid } from 'uuid';
import { VimCompleteItem } from 'coc.nvim/lib/types';

export interface CursorPosition {
  bufnum: number;
  lnum: number;
  col: number;
}

process.on('uncaughtException', (err) => {
  const msg = 'Uncaught exception: ' + err.stack;
  // eslint-disable-next-line no-console
  console.error(msg);
});
export class Helper extends EventEmitter {
  public nvim!: Neovim;
  public proc?: cp.ChildProcess;
  public plugin!: Plugin;

  constructor() {
    super();
    this.setMaxListeners(99);
  }

  public setup(): Promise<void> {
    const vimrc = pathLib.resolve(__dirname, 'vimrc');
    const proc = (this.proc = cp.spawn(
      'nvim',
      ['-u', vimrc, '-i', 'NONE', '--embed'],
      {
        cwd: __dirname,
      },
    ));
    const plugin = (this.plugin = attach({ proc }));
    this.nvim = plugin.nvim;
    this.nvim.uiAttach(160, 80, {}).catch((_e) => {
      // noop
    });
    proc.on('exit', () => {
      this.proc = undefined;
    });
    this.nvim.on('notification', (method, args) => {
      if (method === 'redraw') {
        for (const arg of args) {
          const event = arg[0];
          this.emit(event, arg.slice(1));
        }
      }
    });
    return new Promise((resolve) => {
      plugin.once('ready', resolve);
    });
  }

  public async shutdown(): Promise<void> {
    await this.plugin.dispose();
    await this.nvim.quit();
    if (this.proc) {
      this.proc.kill('SIGKILL');
    }
    await this.wait(60);
  }

  public async waitPopup(): Promise<void> {
    for (let i = 0; i < 40; i++) {
      await this.wait(50);
      const visible = await this.nvim.call('pumvisible');
      if (visible) {
        return;
      }
    }
    throw new Error('timeout after 2s');
  }

  public async waitFloat(): Promise<number> {
    for (let i = 0; i < 40; i++) {
      await this.wait(50);
      const winid = await this.nvim.call('coc#util#get_float');
      if (winid) {
        return winid;
      }
    }
    throw new Error('timeout after 2s');
  }

  public async selectCompleteItem(idx: number): Promise<void> {
    await this.nvim.call('nvim_select_popupmenu_item', [idx, true, true, {}]);
  }

  public async reset(): Promise<void> {
    const mode = await this.nvim.call('mode');
    if (mode !== 'n') {
      await this.nvim.command('stopinsert');
      await this.nvim.call('feedkeys', [String.fromCharCode(27), 'in']);
    }
    await this.nvim.command('silent! %bwipeout!');
    await this.wait(60);
  }

  public async pumvisible(): Promise<boolean> {
    const res = (await this.nvim.call('pumvisible', [])) as number;
    return res === 1;
  }

  public wait(ms = 30): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  public async visible(word: string, source?: string): Promise<boolean> {
    await this.waitPopup();
    const context = (await this.nvim.getVar('coc#_context')) as any;
    const items = context.candidates;
    if (!items) {
      return false;
    }
    const item = items.find((o: { word: string }) => o.word === word);
    if (!item || !item.user_data) {
      return false;
    }
    try {
      const o = JSON.parse(item.user_data);
      if (source && o.source !== source) {
        return false;
      }
    } catch (e) {
      return false;
    }
    return true;
  }

  public async notVisible(word: string): Promise<boolean> {
    const items = await this.getItems();
    return items.findIndex((o) => o.word === word) === -1;
  }

  public async getItems(): Promise<VimCompleteItem[]> {
    const visible = await this.pumvisible();
    if (!visible) {
      return [];
    }
    const context = (await this.nvim.getVar('coc#_context')) as any;
    const items = context.candidates;
    return items || [];
  }

  public async edit(file?: string): Promise<Buffer> {
    if (!file || !pathLib.isAbsolute(file)) {
      file = pathLib.join(__dirname, file ? file : `${uuid()}`);
    }
    const escaped = await this.nvim.call('fnameescape', file);
    await this.nvim.command(`edit ${escaped}`);
    await this.wait(60);
    const bufnr = (await this.nvim.call('bufnr', ['%'])) as number;
    return this.nvim.createBuffer(bufnr);
  }

  public async createDocument(name?: string): Promise<Document> {
    const buf = await this.edit(name);
    const doc = workspace.getDocument(buf.id);
    if (!doc) {
      return await workspace.document;
    }
    return doc;
  }

  public async getCmdline(): Promise<string> {
    let str = '';
    for (let i = 1, l = 70; i < l; i++) {
      const ch = await this.nvim.call('screenchar', [79, i]);
      if (ch === -1) {
        break;
      }
      str += String.fromCharCode(ch);
    }
    return str.trim();
  }

  public updateConfiguration(key: string, value: any): void {
    const { configurations } = workspace as any;
    configurations.updateUserConfig({ [key]: value });
  }

  public async mockFunction(
    name: string,
    result: string | number | any,
  ): Promise<void> {
    const content = `
    function! ${name}(...)
      return ${JSON.stringify(result)}
    endfunction
    `;
    const file = await createTmpFile(content);
    await this.nvim.command(`source ${file}`);
  }

  public async items(): Promise<VimCompleteItem[]> {
    const context = (await this.nvim.getVar('coc#_context')) as any;
    return context['candidates'] || [];
  }

  public async screenLine(line: number): Promise<string> {
    let res = '';
    for (let i = 1; i <= 80; i++) {
      const ch = await this.nvim.call('screenchar', [line, i]);
      res = res + String.fromCharCode(ch);
    }
    return res;
  }

  public async getFloat(): Promise<Window | undefined> {
    const wins = await this.nvim.windows;
    let floatWin: Window | undefined;
    for (const win of wins) {
      const f = await win.getVar('float');
      if (f) {
        floatWin = win;
      }
    }
    return floatWin;
  }
}

export async function createTmpFile(content: string): Promise<string> {
  const tmpFolder = pathLib.join(os.tmpdir(), `coc-${process.pid}`);
  if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder);
  }
  const filename = pathLib.join(tmpFolder, uuid());
  await util.promisify(fs.writeFile)(filename, content, 'utf8');
  return filename;
}

export default new Helper();
