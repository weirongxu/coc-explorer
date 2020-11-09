import {
  ExtensionContext,
  commands,
  workspace,
  listManager,
  Disposable,
  languages,
} from 'coc.nvim';
import { hlGroupManager } from './source/highlights/highlightManager';
import { ExplorerManager } from './explorerManager';
import { PresetList } from './lists/presets';
import { registerVimApi } from './vimApi';
import { InternalVimEvents } from './events';
import { asyncCatchError, onError, registerRuntimepath } from './util';
import { ActionMenuCodeActionProvider } from './codeActionProider';
import { activateHelper } from 'coc-helper';

export const activate = async (context: ExtensionContext) => {
  const { subscriptions } = context;
  const { nvim } = workspace;
  await activateHelper(context);
  await InternalVimEvents.register(context);

  hlGroupManager.group(
    'SelectUI',
    'ctermbg=27 ctermfg=0 guibg=#1593e5 guifg=#ffffff',
  );
  const normalFloat = hlGroupManager.linkGroup('NormalFloat', 'NormalFloat');
  hlGroupManager.linkGroup('NormalFloatBorder', normalFloat.group);

  listManager.registerList(new PresetList(nvim));

  const explorerManager = new ExplorerManager(context);
  registerVimApi(context, explorerManager);

  subscriptions.push(
    commands.registerCommand('explorer', (...args) => {
      explorerManager.open(args).catch(onError);
    }),
    languages.registerCodeActionProvider(
      ['coc-explorer'],
      new ActionMenuCodeActionProvider(explorerManager),
      'coc-explorer',
    ),
  );
  (async () => {
    await registerRuntimepath(context.extensionPath);
    await nvim.command('runtime plugin/coc_explorer.vim');
    subscriptions.push(
      Disposable.create(
        asyncCatchError(() => {
          return nvim.call('CocExplorerDeactivate');
        }),
      ),
    );
    await explorerManager.events.fire('didAutoload');
  })().catch(onError);
};
