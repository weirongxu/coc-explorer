import { workspace } from 'coc.nvim';
import { ExplorerConfig } from '../config';
import { GitFormat, GitRootFormat } from './types';

export const getRootStatusIcons = (config: ExplorerConfig) => {
  const getRootIconConf = (name: string) => {
    const deprecatedIcon = config.get<string>(
      'file.column.root.git.icon.' + name,
    );
    let icon: string;
    if (deprecatedIcon !== undefined) {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(
        `explorer.file.column.root.git.icon.${name} has been deprecated, please use explorer.git.icon.rootStatus.${name} in coc-settings.json`,
        'warning',
      );
      icon = deprecatedIcon;
    } else {
      icon = config.get<string>('git.icon.rootStatus.' + name)!;
    }
    return {
      icon,
      name,
    };
  };

  return {
    [GitRootFormat.staged]: {
      icon: '',
      name: 'staged',
    },
    [GitRootFormat.stashed]: getRootIconConf('stashed'),
    [GitRootFormat.ahead]: getRootIconConf('ahead'),
    [GitRootFormat.behind]: getRootIconConf('behind'),
    [GitRootFormat.conflicted]: getRootIconConf('conflicted'),
    [GitRootFormat.untracked]: getRootIconConf('untracked'),
    [GitRootFormat.modified]: getRootIconConf('modified'),
    [GitRootFormat.added]: getRootIconConf('added'),
    [GitRootFormat.renamed]: getRootIconConf('renamed'),
    [GitRootFormat.deleted]: getRootIconConf('deleted'),
  };
};

export const getStatusIcons = (config: ExplorerConfig) => {
  const getIconConf = (name: string) => {
    const deprecatedIcon = config.get<string>('file.column.git.icon.' + name);
    let icon: string;
    if (deprecatedIcon !== undefined) {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(
        `explorer.file.column.git.icon.${name} has been deprecated, please use explorer.git.icon.status.${name} in coc-settings.json`,
        'warning',
      );
      icon = deprecatedIcon;
    } else {
      icon = config.get<string>('git.icon.status.' + name)!;
    }
    return {
      icon,
      name,
    };
  };

  return {
    [GitFormat.mixed]: getIconConf('mixed'),
    [GitFormat.unmodified]: getIconConf('unmodified'),
    [GitFormat.modified]: getIconConf('modified'),
    [GitFormat.added]: getIconConf('added'),
    [GitFormat.deleted]: getIconConf('deleted'),
    [GitFormat.renamed]: getIconConf('renamed'),
    [GitFormat.copied]: getIconConf('copied'),
    [GitFormat.unmerged]: getIconConf('unmerged'),
    [GitFormat.untracked]: getIconConf('untracked'),
    [GitFormat.ignored]: getIconConf('ignored'),
  };
};
