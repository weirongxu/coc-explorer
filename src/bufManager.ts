import { ExtensionContext, workspace } from 'coc.nvim';
import pathLib from 'path';
import { buffer, debounceTime, Subject } from 'rxjs';
import { tabContainerManager } from './container';
import { internalEvents, onEvent } from './events';
import type { BufferNode } from './source/sources/buffer/bufferSource';
import {
  compactI,
  leaveEmptyInWinids,
  logger,
  subjectToHook,
  throttleFn,
  winidsByBufnr,
} from './util';

const regex = /^\s*(\d+)(.+?)"(.+?)".*/;

export interface BufModifiedOptions {
  /**
   * Declare whether fullpath is a directory
   */
  directory: boolean;
}

export interface BufRemoveOrReplaceOptions {
  /**
   * Throw exception when skipModified is false and buffer is modified
   */
  skipModified: boolean;
  /**
   * Use bwipeout to remove the buffer otherwise is bdelete
   */
  bwipeout: boolean;
  /**
   * Declare whether fullpath is a directory
   */
  directory: boolean;
}

export class BufManager {
  private bufferNodeMapByFullpath: Map<string, BufferNode> = new Map();
  private bufferNodeMapById: Map<number, BufferNode> = new Map();
  private nvim = workspace.nvim;
  private reloadSubject = new Subject<void>();
  private modifiedSubject = new Subject<string>();

  bufferNodes: BufferNode[] = [];
  onReload = subjectToHook(this.reloadSubject);
  onReloadDebounce = subjectToHook(this.reloadSubject.pipe(debounceTime(500)));
  onModifiedDebounce = subjectToHook(
    this.modifiedSubject.pipe(
      buffer(this.modifiedSubject.pipe(debounceTime(500))),
    ),
  );

  constructor(context: ExtensionContext) {
    this.registerEvents(context).catch(logger.error);
  }

  async registerEvents(context: ExtensionContext) {
    context.subscriptions.push(
      onEvent(
        ['BufCreate', 'BufHidden', 'BufUnload', 'BufWinEnter', 'BufWinLeave'],
        throttleFn(100, () => this.reload(), {
          leading: false,
          trailing: true,
        }),
      ),
      internalEvents.on('BufDelete', () => this.reload()),
      internalEvents.on('BufWipeout', () => this.reload()),
    );

    context.subscriptions.push(
      onEvent('BufWinEnter', (bufnr) =>
        tabContainerManager.curTabAddBufnr(bufnr),
      ),
      internalEvents.on('TabEnter', (bufnr) =>
        tabContainerManager.curTabAddBufnr(bufnr),
      ),
    );

    const refreshBufModified = async (bufnr: number) => {
      const bufNode = this.bufferNodeMapById.get(bufnr);
      if (!bufNode) {
        return;
      }
      const modified = (await workspace.nvim.eval(
        // avoid error when buffer is not loaded
        `bufloaded(${bufnr}) ? getbufvar(${bufnr}, '&modified') : v:null`,
      )) as boolean | null;
      if (modified === null || bufNode.modified === modified) {
        return;
      }
      bufNode.modified = modified;
      this.modifiedSubject.next(bufNode.fullpath);
    };

    context.subscriptions.push(
      onEvent('BufWritePost', async (bufnr) => {
        await refreshBufModified(bufnr);
      }),
      ...(['TextChanged', 'TextChangedI', 'TextChangedP'] as const).map(
        (event) =>
          onEvent(event as any, async (bufnr: number) => {
            await refreshBufModified(bufnr);
          }),
      ),
    );
  }

  async removeBufNode(bufNode: BufferNode, options: BufRemoveOrReplaceOptions) {
    if (!options.skipModified && bufNode.modified) {
      throw new Error('The content of buffer has not been saved!');
    }

    const winids = await winidsByBufnr(bufNode.bufnr);
    await leaveEmptyInWinids(winids);

    if (options.bwipeout) {
      await this.nvim.command(`bwipeout! ${bufNode.bufnr}`);
    } else {
      await this.nvim.command(`bdelete! ${bufNode.bufnr}`);
    }
  }

  async removePrefix(
    prefixFullpath: string,
    options: BufRemoveOrReplaceOptions,
  ) {
    for (const [fullpath, bufNode] of this.bufferNodeMapByFullpath) {
      if (fullpath.startsWith(prefixFullpath)) {
        await this.removeBufNode(bufNode, options);
      }
    }
  }

  async remove(fullpath: string, options: BufRemoveOrReplaceOptions) {
    if (options.directory) {
      return this.removePrefix(fullpath + pathLib.sep, options);
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
    options: BufRemoveOrReplaceOptions,
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
    options: BufRemoveOrReplaceOptions,
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
    options: BufRemoveOrReplaceOptions,
  ) {
    return this.replacePrefix(sourceFullpath, targetFullpath, options);
  }

  /**
   * Return the whether fullpath is modified
   */
  modified(fullpath: string, options: BufModifiedOptions): boolean {
    if (options.directory) {
      return this.modifiedPrefix(fullpath + pathLib.sep);
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

    this.reloadSubject.next();
  }
}
