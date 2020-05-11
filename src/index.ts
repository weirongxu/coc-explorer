import { ExtensionContext, commands, workspace, listManager } from 'coc.nvim';
import { registerLogger, onError } from './logger';
import { hlGroupManager } from './source/highlightManager';
import { ExplorerManager } from './explorerManager';
import { PresetList } from './lists/presets';
import { registerVimApi } from './vimApi';
import { registerBufDeleteEvents } from './events';

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
  );
  registerVimApi(context, explorerManager);
  registerBufDeleteEvents(context);

  nvim
    .getOption('runtimepath')
    .then(async (rtp) => {
      const paths = (rtp as string).split(',');
      if (!paths.includes(context.extensionPath)) {
        await nvim.command(
          `execute 'noa set rtp^='.fnameescape('${context.extensionPath.replace(
            /'/g,
            "''",
          )}')`,
        );
      }
      explorerManager.emitterDidAutoload.fire();
    })
    .catch(onError);
};
