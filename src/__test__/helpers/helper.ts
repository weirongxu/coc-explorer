import { workspace } from 'coc.nvim';
import pathLib from 'path';
import { Args } from '../../arg/parseArgs';
import { BufManager } from '../../bufManager';
import { buildExplorerConfig, configLocal } from '../../config';
import { Explorer } from '../../explorer';
import { ExplorerManager } from '../../explorerManager';
import type { ExplorerSource } from '../../source/source';

export function mockWorkspace() {
  const nvimCall = jest.fn(async (fname: string, argOrArgs: any) => {
    const args = Array.isArray(argOrArgs) ? argOrArgs : [argOrArgs];
    if (fname === 'bufnr') return 1;
    if (fname === 'coc_explorer#util#strdisplayslice')
      return args[0].slice(args[1], args[2] ?? undefined);
  });
  Object.defineProperty(workspace, 'nvim', {
    get() {
      return {
        pauseNotification: jest.fn(() => {}),
        resumeNotification: jest.fn(() => Promise.resolve()) as jest.Mock<
          Promise<any>
        >,
        call: nvimCall,
        createBuffer: jest.fn(() => {}) as any,
      };
    },
  });

  Object.defineProperty(workspace, 'isVim', {
    get() {
      return false;
    },
  });

  Object.defineProperty(workspace, 'isNvim', {
    get() {
      return true;
    },
  });
}

export function getExplorer() {
  const config = configLocal();
  const context = {
    subscriptions: [],
    extensionPath: '',
    asAbsolutePath() {
      return '';
    },
    storagePath: '',
    workspaceState: undefined as any,
    globalState: undefined as any,
    logger: undefined as any,
  };
  return new Explorer(
    0,
    new ExplorerManager(context, new BufManager(context)),

    0,
    undefined,
    buildExplorerConfig(config),
  );
}

export function bootSource<S extends ExplorerSource<any>>(
  getSource: (explorer: Explorer) => S,
  options: {
    args?: string[];
    rootUri?: string;
  } = {},
) {
  type Context = {
    explorer: Explorer;
    source: S;
  };

  const context: Context = {
    explorer: null,
    source: null,
  } as unknown as Context;

  beforeAll(() => {
    context.explorer = getExplorer();
    const args = new Args(options.args ?? []);
    const root = options.rootUri ?? pathLib.sep;
    // @ts-ignore
    context.explorer.args_ = args;
    // @ts-ignore
    context.explorer.argValues_ = { rootUri: root };
    // @ts-ignore
    context.explorer.root_ = root;
    context.source = getSource(context.explorer);
    // @ts-ignore
    context.explorer.sources_ = [context.source];
    context.source.root = root;
  });

  return context;
}
