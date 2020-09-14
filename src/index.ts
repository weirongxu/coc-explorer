import {
  ExtensionContext,
  commands,
  workspace,
  listManager,
  Disposable,
  languages,
} from 'coc.nvim';
import { registerLogger, onError } from './logger';
import { hlGroupManager } from './source/highlightManager';
import { ExplorerManager } from './explorerManager';
import { PresetList } from './lists/presets';
import { registerVimApi } from './vimApi';
import { registerInternalEvents } from './events';
import { asyncCatchError, registerRuntimepath } from './util';
import { ActionMenuCodeActionProvider } from './codeActionProider';

export const activate = async (context: ExtensionContext) => {
  const { subscriptions, logger } = context;
  const { nvim } = workspace;
  registerLogger(logger);

  hlGroupManager.group(
    'SelectUI',
    'ctermbg=27 ctermfg=0 guibg=#1593e5 guifg=#ffffff',
  );
  const normalFloat = hlGroupManager.linkGroup('NormalFloat', 'NormalFloat');
  hlGroupManager.linkGroup('NormalFloatBorder', normalFloat.group);

  listManager.registerList(new PresetList(nvim));

  const explorerManager = new ExplorerManager(context);

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
  registerVimApi(context, explorerManager);
  registerInternalEvents(context);
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
    explorerManager.emitterDidAutoload.fire();
  })().catch(onError);
};
