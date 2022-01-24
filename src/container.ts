import { ExtensionContext, workspace } from 'coc.nvim';
import { ParsedPosition } from './arg/parseArgs';
import { Explorer } from './explorer';

export class TabContainer {
  left?: Explorer;
  right?: Explorer;
  tab?: Explorer;
  floating?: Explorer;
  bufnrs = new Set<number>();

  getExplorer(position: ParsedPosition) {
    return this[position.name];
  }

  setExplorer(position: ParsedPosition, explorer: Explorer) {
    this[position.name] = explorer;
  }

  all() {
    const explorers = [];
    if (this.left) {
      explorers.push(this.left);
    }
    if (this.right) {
      explorers.push(this.right);
    }
    if (this.tab) {
      explorers.push(this.tab);
    }
    if (this.floating) {
      explorers.push(this.floating);
    }
    return explorers;
  }
}

export class TabContainerManager {
  tabContainerMap = new Map<number, TabContainer>();

  get(id: number) {
    const c = this.tabContainerMap.get(id);
    if (c) {
      return c;
    } else {
      const c = new TabContainer();
      this.tabContainerMap.set(id, c);
      return c;
    }
  }

  async register() {
    // add buffers to tab when vim enter
    const bufnrs: number[] = await workspace.nvim.call('tabpagebuflist');
    await tabContainerManager.curTabAddBufnr(...bufnrs);
  }

  values() {
    return Array.from(this.tabContainerMap.values());
  }

  async currentTabId() {
    return (await workspace.nvim.call('coc_explorer#tab#current_id')) as number;
  }

  async currentTabMaxId() {
    return (await workspace.nvim.call('coc_explorer#tab#max_id')) as number;
  }

  async currentTabContainer(): Promise<undefined | TabContainer> {
    return this.get(await this.currentTabId());
  }

  existBufnr(bufnr: number) {
    return this.values().some((c) => c.bufnrs.has(bufnr));
  }

  async curTabAddBufnr(...bufnrs: number[]) {
    const id = await this.currentTabId();
    const c = this.get(id);
    bufnrs.forEach((bufnr) => c.bufnrs.add(bufnr));
  }

  async curTabDelBufnr(...bufnrs: number[]) {
    const id = await this.currentTabId();
    const c = this.get(id);
    bufnrs.forEach((bufnr) => c.bufnrs.delete(bufnr));
  }
}

export const tabContainerManager = new TabContainerManager();
