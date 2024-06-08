import type { ExplorerConfig } from '../config';
import { GitFormat, GitRootFormat } from './types';

export const getRootStatusIcons = (config: ExplorerConfig) => {
  const getRootIconConf = (name: string) => {
    const icon = config.get<string>(`git.icon.rootStatus.${name}`);
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
    const icon = config.get<string>(`git.icon.status.${name}`);
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
