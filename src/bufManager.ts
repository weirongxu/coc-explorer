import { Emitter, ExtensionContext, workspace } from 'coc.nvim';
import pathLib from 'path';
import { internalEvents, onEvent } from './events';
import { ExplorerManager } from './explorerManager';
import { BufferNode } from './source/sources/buffer/bufferSource';
import { compactI, throttle, winidsByBufnr } from './util';

const regex = /^\s*(\d+)(.+?)"(.+?)".*/;

export interface BufRemoveOptions {
  /**
   * Throw exception when skipModified is false and buffer is modified
   */
  skipModified: boolean;
  /**
   * Use bwipeout to remove the buffer otherwise is bdelete
   */
  bwipeout: boolean;
}

export class BufManager {
  bufferNodes: BufferNode[] = [];
  onReload = (fn: () => void) => this.reloadEvent.event(fn);
  onModified = (fn: (fullpath: string) => void) => this.modifiedEvent.event(fn);

  private bufferNodeMapByFullpath: Map<string, BufferNode> = new Map();
  private bufferNodeMapById: Map<number, BufferNode> = new Map();
  private nvim = workspace.nvim;
  private reloadEvent = new Emitter<void>();
  private modifiedEvent = new Emitter<string>();

  constructor(
    context: ExtensionContext,
    public readonly explorerManager: ExplorerManager,
  ) {
    context.subscriptions.push(
      onEvent(
        ['BufCreate', 'BufHidden', 'BufUnload', 'BufWinEnter', 'BufWinLeave'],
        throttle(100, () => this.reload(), { leading: false, trailing: true }),
      ),
      onEvent('BufWritePost', async (bufnr) => {
        await this.reload();
        const node = this.bufferNodeMapById.get(bufnr);
        if (node) {
          this.modifiedEvent.fire(node.fullpath);
        }
      }),
      internalEvents.on('BufDelete', () => this.reload()),
      internalEvents.on('BufWipeout', () => this.reload()),
      ...(['TextChanged', 'TextChangedI', 'TextChangedP'] as const).map(
        (event) =>
          onEvent(event as any, async (bufnr: number) => {
            const bufNode = this.bufferNodeMapById.get(bufnr);
            if (!bufNode) {
              return;
            }
            const buffer = this.nvim.createBuffer(bufnr);
            const modified = (await workspace.nvim.eval(
              `bufloaded(${buffer.id}) ? getbufvar(${buffer.id}, '&modified') : v:null`,
            )) as boolean | null;
            // const modified = !!(await buffer.getOption('modified'));
            if (modified === null || bufNode.modified === modified) {
              return;
            }
            bufNode.modified = modified;
            this.modifiedEvent.fire(bufNode.fullpath);
          }),
      ),
    );
  }

  async removeBufNode(bufNode: BufferNode, options: BufRemoveOptions) {
    if (!options.skipModified && bufNode.modified) {
      throw new Error('The content of buffer has not been saved!');
    }

    const { nvim } = this;
    const curWinid = (await nvim.call('win_getid', [])) as number;
    const winids = await winidsByBufnr(bufNode.bufnr);

    if (winids.length) {
      nvim.pauseNotification();
      for (const winid of winids) {
        nvim.call('win_gotoid', [winid], true);
        nvim.command('enew', true);
        if (workspace.isVim) {
          nvim.command('redraw', true);
        }
      }
      nvim.call('win_gotoid', [curWinid], true);
      await nvim.resumeNotification();
    }
    if (options.bwipeout) {
      await nvim.command(`bwipeout! ${bufNode.bufnr}`);
    } else {
      await nvim.command(`bdelete! ${bufNode.bufnr}`);
    }
  }

  async removePrefix(prefixFullpath: string, options: BufRemoveOptions) {
    for (const [fullpath, bufNode] of this.bufferNodeMapByFullpath) {
      if (fullpath.startsWith(prefixFullpath)) {
        await this.removeBufNode(bufNode, options);
      }
    }
  }

  async remove(fullpath: string, options: BufRemoveOptions) {
    if (fullpath.endsWith(pathLib.sep)) {
      return this.removePrefix(fullpath, options);
    } else {
      const bufNode = this.bufferNodeMapByFullpath.get(fullpath);
      if (!bufNode) {
        return;
      }
      await this.removeBufNode(bufNode, options);
    }
  }

  async replaceBufNode(
    bufNode: BufferNode,
    targetFullpath: string,
    options: BufRemoveOptions,
  ) {
    if (!options.skipModified && bufNode.modified) {
      throw new Error('The content of buffer has not been saved!');
    }

    const { nvim } = this;
    const curWinid = (await nvim.call('win_getid', [])) as number;
    const winids = await winidsByBufnr(bufNode.bufnr);

    if (winids.length) {
      const escapedPath = (await nvim.call('fnameescape', [
        targetFullpath,
      ])) as string;
      nvim.pauseNotification();
      for (const winid of winids) {
        nvim.call('win_gotoid', [winid], true);
        nvim.command(`edit ${escapedPath}`, true);
        if (workspace.isVim) {
          nvim.command('redraw', true);
        }
      }
      nvim.call('win_gotoid', [curWinid], true);
      await nvim.resumeNotification();
    }

    if (options.bwipeout) {
      await nvim.command(`bwipeout! ${bufNode.bufnr}`);
    } else {
      await nvim.command(`bdelete! ${bufNode.bufnr}`);
    }
  }

  async replacePrefix(
    sourceFullpath: string,
    targetFullpath: string,
    options: BufRemoveOptions,
  ) {
    for (const [fullpath, bufNode] of this.bufferNodeMapByFullpath) {
      if (fullpath.startsWith(sourceFullpath)) {
        const newTargetFullpath = bufNode.fullpath.replace(
          sourceFullpath,
          targetFullpath,
        );
        await this.replaceBufNode(bufNode, newTargetFullpath, options);
      }
    }
  }

  async replace(
    sourceFullpath: string,
    targetFullpath: string,
    options: BufRemoveOptions,
  ) {
    return this.replacePrefix(sourceFullpath, targetFullpath, options);
  }

  modified(fullpath: string): boolean {
    if (fullpath.endsWith(pathLib.sep)) {
      return this.modifiedPrefix(fullpath);
    } else {
      return this.bufferNodeMapByFullpath.get(fullpath)?.modified ?? false;
    }
  }

  modifiedPrefix(prefixFullpath: string): boolean {
    for (const [fullpath, bufNode] of this.bufferNodeMapByFullpath) {
      if (fullpath.startsWith(prefixFullpath)) {
        if (bufNode.modified) {
          return true;
        }
      }
    }
    return false;
  }

  getBufferNode(bufnrOrFullpath: number | string) {
    if (typeof bufnrOrFullpath === 'number') {
      return this.bufferNodeMapById.get(bufnrOrFullpath);
    } else {
      return this.bufferNodeMapByFullpath.get(bufnrOrFullpath);
    }
  }

  async waitReload() {
    return new Promise<void>((resolve) => {
      const disposable = this.onReload(() => {
        disposable.dispose();
        resolve();
      });
      setTimeout(resolve, 100);
    });
  }

  async reload() {
    const lsCommand = 'ls!';
    const content = (await this.nvim.call('execute', lsCommand)) as string;

    this.bufferNodes = compactI(
      await Promise.all(
        content.split(/\n/).map(async (line) => {
          const matches = line.match(regex);
          if (!matches) {
            return;
          }
          const bufnr = matches[1];
          const flags = matches[2];
          const bufname = matches[3];
          const fullpath: string = await workspace.nvim.call('expand', [
            `#${bufnr}:p`,
            1,
          ]);
          return {
            type: 'child' as const,
            uid: bufnr,
            level: 1,
            bufnr: parseInt(bufnr),
            bufnrStr: bufnr,
            bufname,
            fullpath,
            name: pathLib.basename(bufname),
            unlisted: flags.includes('u'),
            current: flags.includes('%'),
            previous: flags.includes('#'),
            visible: flags.includes('a'),
            hidden: flags.includes('h'),
            modifiable: !flags.includes('-'),
            readonly: flags.includes('='),
            terminal:
              flags.includes('R') || flags.includes('F') || flags.includes('?'),
            modified: flags.includes('+'),
            readErrors: flags.includes('x'),
          };
        }),
      ),
    );

    this.bufferNodeMapByFullpath = this.bufferNodes.reduce((map, node) => {
      map.set(node.fullpath, node);
      return map;
    }, new Map<string, BufferNode>());

    this.bufferNodeMapById = this.bufferNodes.reduce((map, node) => {
      map.set(node.bufnr, node);
      return map;
    }, new Map<number, BufferNode>());

    this.reloadEvent.fire();
  }
}
