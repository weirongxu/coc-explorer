import {
  BasicList,
  CancellationToken,
  Emitter,
  events,
  ListActionOptions,
  ListContext,
  ListItem,
  listManager,
  ListTask,
  Location,
  LocationWithLine,
  ProviderResult,
  workspace,
} from 'coc.nvim';
import type { Explorer } from '../explorer';
import { sleep, winnrByBufnr } from '../util';

interface ExplListItem<Data> extends ListItem {
  data: Data;
}

interface ListInit<Arg, Data> {
  init: (this: InitContext<Arg, Data>, list: InitContext<Arg, Data>) => void;
  name: string;
  loadItems: (
    arg: Arg,
    context: ListContext,
    token?: CancellationToken,
  ) => Promise<ExplListItem<Data>[] | ListTask | null | undefined>;
  doHighlight?: BasicList['doHighlight'];
  defaultAction?: string;
}

const argSym = Symbol('arg');

interface InitContext<Arg, Data> {
  addAction: (
    name: string,
    fn: (arg: {
      arg: Arg;
      item: ExplListItem<Data>;
      context: ListContext;
    }) => ProviderResult<void>,
    options?: ListActionOptions,
  ) => void;
  addLocationActions(): void;
  convertLocation(
    location: Location | LocationWithLine | string,
  ): Promise<Location>;
}

export class ProxyList<Arg, Data> extends BasicList {
  #loadItems: BasicList['loadItems'];
  [argSym]!: Arg;

  constructor(init: ListInit<Arg, Data>) {
    super(workspace.nvim);
    this.name = init.name;
    this.#loadItems = (context: ListContext, token?: CancellationToken) =>
      init.loadItems(this[argSym], context, token);
    if (init.doHighlight) {
      this.doHighlight = init.doHighlight;
    }
    if (init.defaultAction) {
      this.defaultAction = init.defaultAction;
    }
    const initContext: InitContext<Arg, Data> = {
      addAction: (
        name: string,
        fn: ({
          arg,
          item,
          context,
        }: {
          arg: Arg;
          item: ExplListItem<Data>;
          context: ListContext;
        }) => ProviderResult<void>,
        options?: ListActionOptions,
      ) =>
        this.addAction(
          name,
          (item, context) =>
            fn({
              arg: this[argSym],
              item: item as ExplListItem<Data>,
              context,
            }),
          options,
        ),
      addLocationActions: () => this.addLocationActions(),
      convertLocation: (location: Location | LocationWithLine | string) =>
        this.convertLocation(location),
    };
    init.init.call(initContext, initContext);
  }

  loadItems(context: ListContext, token: CancellationToken) {
    return this.#loadItems(context, token);
  }
}

export function registerList<Arg, Data>(
  init: ListInit<Arg, Data>,
): ProxyList<Arg, Data> {
  return new ProxyList(init);
}

export async function startCocList<Arg, Data>(
  explorer: Explorer,
  list: ProxyList<Arg, Data>,
  arg: Arg,
  listArgs: string[] = [],
) {
  list[argSym] = arg;

  const config = explorer.config;
  const nvim = explorer.nvim;
  const bufManager = explorer.explorerManager.bufManager;

  const floatingHideOnCocList = config.get('floating.hideOnCocList', true);

  let isExplorerShown = true;
  if (explorer.isFloating && floatingHideOnCocList) {
    await explorer.hide();
    isExplorerShown = false;
  }

  const shownExplorerEmitter = new Emitter<void>();
  const listDisposable = listManager.registerList(list);
  await nvim.command(`CocList ${listArgs.join(' ')} ${list.name}`);
  listDisposable.dispose();

  return {
    async waitExplorerShow() {
      await bufManager.waitReload();

      const eventDisposable = events.on('BufEnter', async () => {
        const buf = bufManager.getBufferNode(`list:///${list.name}`);
        if (buf && (await winnrByBufnr(buf.bufnr))) {
          return;
        }
        eventDisposable.dispose();

        if (explorer.isFloating && !isExplorerShown) {
          await sleep(200);
          await explorer.show();
          shownExplorerEmitter.fire();
        }
      });

      if (isExplorerShown) {
        return;
      }
      return new Promise((resolve) => {
        shownExplorerEmitter.event(() => {
          isExplorerShown = true;
          resolve(undefined);
        });
      });
    },
  };
}
