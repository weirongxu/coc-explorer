import { workspace } from 'coc.nvim';
import pathLib from 'path';
import type { Explorer } from './explorer';
import { rootStrategyList, RootStrategyStr } from './types';
import { RootStrategy } from './types/pkg-config';
import { inDirectory, isParentFolder, logger, normalizePath } from './util';

export class Rooter {
  constructor(public workspaceRoot: string) {}

  open(explorer: Explorer) {
    return new RooterOpened(this.workspaceRoot, explorer);
  }
}

export class RooterOpened {
  roots: Record<
    RootStrategy,
    (revealPath?: string) => string | undefined | Promise<string | undefined>
  >;
  customRoots: Record<string, string> = {};

  constructor(public workspaceRoot: string, public explorer: Explorer) {
    const self = this;
    let sourceBufFullpath_: string | undefined | null = null;
    const getSourceBufFullpath = async (): Promise<string | undefined> => {
      if (sourceBufFullpath_ === null)
        sourceBufFullpath_ = await self.resolveBufFullpath();
      return sourceBufFullpath_;
    };
    this.roots = {
      keep: () => undefined,
      workspace: () => workspaceRoot,
      cwd: () => workspace.cwd,
      sourceBuffer: () => {
        return getSourceBufFullpath();
      },
      reveal: (revealPath?: string) =>
        revealPath ? pathLib.dirname(revealPath) : undefined,
    };
  }

  private async resolveRootByPatterns(
    dir: string,
    patterns: string[],
    bottomUp: boolean,
  ) {
    const ndir = normalizePath(dir);
    const parts = ndir.split(pathLib.sep);
    if (bottomUp) {
      while (parts.length > 0) {
        const dir = parts.join(pathLib.sep);
        if (await inDirectory(dir, patterns)) {
          return dir;
        }
        parts.pop();
      }
      return undefined;
    } else {
      const curr: string[] = [parts.shift()!];
      for (const part of parts) {
        curr.push(part);
        const dir = curr.join(pathLib.sep);
        if (await inDirectory(dir, patterns)) {
          return dir;
        }
      }
      return undefined;
    }
  }

  private async resolveRootBy(
    revealPath: string | undefined,
    strategyStr: RootStrategyStr,
  ): Promise<string | undefined> {
    const strategy = strategyStr as RootStrategy;
    const customPrefix = 'custom:';
    if (rootStrategyList.includes(strategy)) {
      return this.roots[strategy](revealPath);
    } else if (strategy.startsWith(customPrefix)) {
      const customStrategy = strategy.slice(customPrefix.length);
      const customRules = this.explorer.config.get('root.customRules');
      const customRule = customRules[customStrategy];

      let dir: string = workspace.cwd;
      const sourceBufFullpath = await this.roots.sourceBuffer();
      if (sourceBufFullpath) {
        dir = sourceBufFullpath.endsWith(pathLib.sep)
          ? sourceBufFullpath
          : pathLib.dirname(sourceBufFullpath);
      }
      if (customRule) {
        return await this.resolveRootByPatterns(
          dir,
          customRule.patterns,
          customRule.bottomUp ?? false,
        );
      }
    }

    logger.error(`${strategyStr} is not supported`);
    return undefined;
  }

  async resolveRoot(
    reveal: string | undefined,
    strategies: RootStrategyStr[],
  ): Promise<string | undefined> {
    if (strategies.includes('keep')) {
      return;
    }
    for (const strategy of strategies) {
      const root = await this.resolveRootBy(reveal, strategy);
      if (!root) {
        continue;
      }
      if (!reveal) {
        return root;
      }
      if (isParentFolder(root, reveal)) {
        return root;
      }
    }
  }

  async resolveBufFullpath() {
    const buf = await this.explorer.sourceBuffer();
    if (!buf) {
      return undefined;
    }

    const buftype = await buf.getVar('&buftype');
    if (buftype === 'nofile') {
      return undefined;
    }

    const fullpath = this.explorer.explorerManager.bufManager.getBufferNode(
      buf.id,
    )?.fullpath;
    if (!fullpath) {
      return undefined;
    }

    return normalizePath(pathLib.dirname(fullpath));
  }
}
