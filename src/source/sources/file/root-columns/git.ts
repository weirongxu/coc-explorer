import { gitManager } from '../../../../git/manager';
import { GitRootFormat } from '../../../../git/types';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights } from '../fileSource';

fileColumnRegistrar.registerColumn(
  'root',
  'git',
  ({ source, subscriptions }) => {
    const getIconConf = (name: string) => ({
      icon: source.getColumnConfig<string>('root.git.icon.' + name)!,
      name,
    });

    const statusIcons = {
      [GitRootFormat.staged]: {
        icon: '',
        name: 'staged',
      },
      [GitRootFormat.stashed]: getIconConf('stashed'),
      [GitRootFormat.ahead]: getIconConf('ahead'),
      [GitRootFormat.behind]: getIconConf('behind'),
      [GitRootFormat.conflicted]: getIconConf('conflicted'),
      [GitRootFormat.untracked]: getIconConf('untracked'),
      [GitRootFormat.modified]: getIconConf('modified'),
      [GitRootFormat.added]: getIconConf('added'),
      [GitRootFormat.renamed]: getIconConf('renamed'),
      [GitRootFormat.deleted]: getIconConf('deleted'),
    };

    return {
      init() {
        subscriptions.push(gitManager.bindFileSource(source, 'root'));
      },
      async available() {
        return await gitManager.cmd.available();
      },
      async draw() {
        return {
          labelVisible({ node }) {
            return !!gitManager.getRootStatus(node.fullpath)?.formats.length;
          },
          drawNode(row, { node, isLabeling }) {
            const status = gitManager.getRootStatus(node.fullpath);
            if (status?.formats.length) {
              const statusChars: string[] = [];
              for (const f of status.formats) {
                if (isLabeling) {
                  statusChars.push(
                    `${statusIcons[f].name}(${statusIcons[f].icon})`,
                  );
                } else {
                  statusChars.push(statusIcons[f].icon);
                }
              }
              const hl = status.allStaged
                ? fileHighlights.gitRootStaged
                : fileHighlights.gitRootUnstaged;
              if (isLabeling) {
                row.add(statusChars.join(' & '), {
                  hl,
                });
              } else {
                row.add('{' + statusChars.join('') + '}', {
                  hl,
                });
              }
            }
          },
        };
      },
    };
  },
);
