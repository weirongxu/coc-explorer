import { activateHelper } from 'coc-helper';
import {
  commands,
  ExtensionContext,
  languages,
  listManager,
  workspace,
} from 'coc.nvim';
import { ActionMenuCodeActionProvider } from './actions/codeActionProider';
import { InternalVimEvents } from './events';
import { ExplorerManager } from './explorerManager';
import { GitCommand } from './git/command';
import { registerGitHighlights } from './git/highlights';
import { registerInternalColors } from './highlight/internalColors';
import { hlGroupManager } from './highlight/manager';
import { PresetList } from './lists/presets';
import { asyncCatchError, logger, registerRuntimepath } from './util';
import { registerVimApi } from './vimApi';
import { config } from './config';

export const activate = (context: ExtensionContext) => {
  const isEnable = config.get('enable', true);
  if (!isEnable) return;

  const { subscriptions } = context;
  const { nvim } = workspace;

  hlGroupManager.createGroup(
    'SelectUI',
    'ctermbg=27 ctermfg=0 guibg=#1593e5 guifg=#ffffff',
  );
  const normalFloat = hlGroupManager.linkGroup('NormalFloat', 'NormalFloat');
  hlGroupManager.linkGroup('NormalFloatBorder', normalFloat.group);

  listManager.registerList(new PresetList(nvim));

  const explorerManager = new ExplorerManager(context);
  registerVimApi(context, explorerManager);

  GitCommand.preload().catch(logger.error);

  subscriptions.push(
    commands.registerCommand(
      'explorer',
      asyncCatchError((...args) => {
        explorerManager.open(args).catch(logger.error);
      }),
    ),
    languages.registerCodeActionProvider(
      ['coc-explorer'],
      new ActionMenuCodeActionProvider(explorerManager),
      'coc-explorer',
    ),
  );
  (async () => {
    await activateHelper(context);
    await InternalVimEvents.register(context);
    await registerRuntimepath(context.extensionPath);
    await nvim.command('runtime plugin/coc_explorer.vim');
    registerGitHighlights(subscriptions);
    registerInternalColors(subscriptions);
    await explorerManager.events.fire('didAutoload');
  })().catch(logger.error);
};
