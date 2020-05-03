import { workspace, ExtensionContext, Emitter } from 'coc.nvim';
import pathLib from 'path';
import { normalizePath, onEvents, onBufDelete, onBufWipeout } from './util';
import { BufferNode } from './source/sources/buffer/bufferSource';

const regex = /^\s*(\d+)(.+?)"(.+?)".*/;

export class BufManager {
  bufferNodes: Map<string, BufferNode> = new Map();
  onReload = (fn: () => void) => this.reloadEvent.event(fn);
  onModified = (fn: (fullpath: string) => void) => this.modifiedEvent.event(fn);

  private nvim = workspace.nvim;
  private reloadEvent = new Emitter<void>();
  private modifiedEvent = new Emitter<string>();

  constructor(public context: ExtensionContext) {
    context.subscriptions.push(
      onEvents(
        [
          'BufCreate',
          'BufHidden',
          'BufUnload',
          'BufWinEnter',
          'BufWinLeave',
          'BufWritePost',
        ],
        () => this.reload(),
      ),
      onBufDelete(() => this.reload()),
      onBufWipeout(() => this.reload()),
      ...(['TextChanged', 'TextChangedI', 'TextChangedP'] as const).map(
        (event) =>
          onEvents(event, async (bufnr: number) => {
            const fullpath: string = await workspace.nvim.call('expand', [
              `#${bufnr}:p`,
            ]);
            const bufNode = this.bufferNodes.get(fullpath);
            if (!bufNode) {
              return;
            }
            const buffer = this.nvim.createBuffer(bufnr);
            const modified = !!(await buffer.getOption('modified'));
            if (bufNode.modified === modified) {
              return;
            }
            bufNode.modified = modified;
            this.modifiedEvent.fire(fullpath);
          }),
      ),
    );
  }

  get list() {
    return Array.from(this.bufferNodes.values());
  }

  async removeBufNode(bufNode: BufferNode, skipModified: boolean) {
    if (!skipModified && bufNode.modified) {
      throw new Error('The content of buffer has not been saved!');
    }

    await this.nvim.command(`bwipeout! ${bufNode.bufnr}`);
  }

  async remove(fullpath: string, skipModified: boolean) {
    if (fullpath.endsWith('/')) {
      return this.removePrefix(fullpath, skipModified);
    } else {
      const bufNode = this.bufferNodes.get(fullpath);
      if (!bufNode) {
        return;
      }
      await this.removeBufNode(bufNode, skipModified);
    }
  }

  async removePrefix(prefixFullpath: string, skipModified: boolean) {
    for (const [fullpath, bufNode] of this.bufferNodes) {
      if (fullpath.startsWith(prefixFullpath)) {
        await this.removeBufNode(bufNode, skipModified);
      }
    }
  }

  modified(fullpath: string): boolean {
    if (fullpath.endsWith('/')) {
      return this.modifiedPrefix(fullpath);
    } else {
      return this.bufferNodes.get(fullpath)?.modified ?? false;
    }
  }

  modifiedPrefix(prefixFullpath: string): boolean {
    for (const [fullpath, bufNode] of this.bufferNodes) {
      if (fullpath.startsWith(prefixFullpath)) {
        if (bufNode.modified) {
          return true;
        }
      }
    }
    return false;
  }

  async reload() {
    const lsCommand = 'ls!';
    const content = (await this.nvim.call('execute', lsCommand)) as string;

    this.bufferNodes = content
      .split(/\n/)
      .reduce<Map<string, BufferNode>>((map, line) => {
        const matches = line.match(regex);
        if (!matches) {
          return map;
        }

        const bufnr = matches[1];
        const flags = matches[2];
        const bufname = matches[3];
        const fullpath = pathLib.resolve(normalizePath(bufname));
        map.set(fullpath, {
          type: 'child',
          uid: bufnr,
          level: 1,
          drawnLine: '',
          // parent: this.rootNode,
          bufnr: parseInt(bufnr),
          bufnrStr: bufnr,
          bufname,
          fullpath,
          basename: pathLib.basename(bufname),
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
        });
        return map;
      }, new Map<string, BufferNode>());

    this.reloadEvent.fire();
  }
}
