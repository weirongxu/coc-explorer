import { activateHelper, registerRuntimepath } from 'coc-helper';
import {
  commands,
  languages,
  listManager,
  workspace,
  type ExtensionContext,
} from 'coc.nvim';
import { ActionMenuCodeActionProvider } from './actions/codeActionProider';
import { BufManager } from './bufManager';
import { config } from './config';
import { tabContainerManager } from './container';
import { registerInternalEvents } from './events';
import { ExplorerManager } from './explorerManager';
import { GitCommand } from './git/command';
import { registerGitHighlights } from './git/highlights';
import { registerInternalColors } from './highlight/internalColors';
import { hlGroupManager } from './highlight/manager';
import { PresetList } from './lists/presets';
import { registerMappings } from './mappings/manager';
import { logger } from './util';
import { registerVimApi } from './vimApi';

export const activate = (context: ExtensionContext) => {
  const { subscriptions } = context;
  const { nvim } = workspace;
  const debug = config.get<boolean>('debug');
  logger.level = debug ? 'debug' : 'info';

  hlGroupManager.createGroup(
    'SelectUI',
    'ctermbg=27 ctermfg=0 guibg=#1593e5 guifg=#ffffff',
  );
  const normalFloat = hlGroupManager.linkGroup('NormalFloat', 'NormalFloat');
  hlGroupManager.linkGroup('NormalFloatBorder', normalFloat.group);

  listManager.registerList(new PresetList(nvim));

  const bufManager = new BufManager(context);
  const explorerManager = new ExplorerManager(context, bufManager);
  registerVimApi(context, explorerManager);

  GitCommand.preload().catch(logger.error);

  subscriptions.push(
    commands.registerCommand(
      'explorer',
      logger.asyncCatch((...args) => {
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
    registerInternalEvents(context);
    await registerRuntimepath(context);
    await nvim.command('runtime plugin/coc_explorer.vim');
    registerGitHighlights(subscriptions);
    registerInternalColors(subscriptions);
    await registerMappings(context, explorerManager);
    await explorerManager.events.fire('inited');
    await tabContainerManager.initedEmitter.fire();
    bufManager.reload().catch(logger.error);
    await tabContainerManager.register();
  })().catch(logger.error);
};
