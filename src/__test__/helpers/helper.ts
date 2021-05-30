import pathLib from 'path';
import { buildExplorerConfig, configLocal } from '../../config';
import { Explorer } from '../../explorer';
import { ExplorerManager } from '../../explorerManager';
import { Args } from '../../arg/parseArgs';
import { argOptions } from '../../arg/argOptions';
import { ExplorerSource } from '../../source/source';

export function getExplorer() {
  const config = configLocal();
  return new Explorer(
    0,
    new ExplorerManager({
      subscriptions: [],
      extensionPath: '',
      asAbsolutePath() {
        return '';
      },
      storagePath: '',
      workspaceState: undefined as any,
      globalState: undefined as any,
      logger: undefined as any,
    }),
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

  const context: Context = ({
    explorer: null,
    source: null,
  } as unknown) as Context;

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
