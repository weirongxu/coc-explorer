import pathLib from 'path';
import { ExtensionContext, commands, workspace } from 'coc.nvim';
import { Explorer } from './explorer';
import { registerLogger, onError } from './logger';
import { hlGroupManager } from './source/highlight-manager';

export const activate = async (context: ExtensionContext) => {
  const { subscriptions, logger } = context;
  const { nvim } = workspace;
  registerLogger(logger);

  hlGroupManager.register(hlGroupManager.hlGroupCommand('SelectUI', 'ctermbg=27 ctermfg=0 guibg=#1593e5 guifg=#ffffff'));
  hlGroupManager.executeCommands().catch(onError);

  nvim
    .getOption('runtimepath')
    .then(async (rtp) => {
      const paths = (rtp as string).split(',');
      const extensionPath = pathLib.resolve(__dirname, '..');
      if (!paths.includes(extensionPath)) {
        await nvim.command(`execute 'noa set rtp^='.fnameescape('${extensionPath.replace(/'/g, "''")}')`);
      }
    })
    .catch(onError);

  const explorer = new Explorer(context);

  subscriptions.push(
    commands.registerCommand('explorer', (...args) => {
      explorer.open(args).catch(onError);
    }),
  );
};
