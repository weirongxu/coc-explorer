import pathLib from 'path';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { debounce } from '../../../../util';
import { fileHighlights } from '../fileSource';
import { gitHighlights, gitChanged } from '../../../../git/highlights';
import { HighlightCommand } from '../../../highlightManager';
import { GitMixedStatus, GitFormat } from '../../../../git/types';
import { gitManager } from '../../../../git/manager';

fileColumnRegistrar.registerColumn(
  'child',
  'filename',
  ({ source, subscriptions }) => {
    const cache = { highlightMap: {} as Record<string, HighlightCommand | null> };

    const load = async () => {
      const [
        errorPaths,
        warningPaths,
      ] = source.diagnosticManager.getMixedErrorsAndWarns(source.root);

      // Lower entries have higher priority
      const priority: Array<[Set<string>, HighlightCommand]> = [
        [warningPaths, fileHighlights.diagnosticWarning],
        [errorPaths, fileHighlights.diagnosticError],
      ];
        
      const gitColor = (status: GitMixedStatus) => {
        switch (status.x) {
          case GitFormat.mixed:
            return gitHighlights.gitMixed;
          case GitFormat.unmodified:
            return gitHighlights.gitUnmodified;
          case GitFormat.modified:
            return gitHighlights.gitModified;
          case GitFormat.added:
            return gitHighlights.gitAdded;
          case GitFormat.deleted:
            return gitHighlights.gitDeleted;
          case GitFormat.renamed:
            return gitHighlights.gitRenamed;
          case GitFormat.copied:
            return gitHighlights.gitCopied;
          case GitFormat.unmerged:
            return gitHighlights.gitUnmerged;
          case GitFormat.untracked:
            return gitHighlights.gitUntracked;
          case GitFormat.ignored:
            return gitHighlights.gitIgnored;
        }
      };

      const gitStatuses = await gitManager.getMixedStatuses(source.root);

      const localHighlightMap: Record<string, HighlightCommand | null> = {};
      const prevMap = cache.highlightMap;
      const updatePaths: Set<string> = new Set();

      for (const [fullpath, status] of Object.entries(gitStatuses)) {
        console.error("hi");
        localHighlightMap[fullpath] = gitColor(status);
        updatePaths.add(fullpath);

        if (fullpath in prevMap) {
          delete prevMap[fullpath];
        }
      }

      for (const [paths, highlight] of priority) {
        for (const [fullpath, _] of paths.entries()) {
          localHighlightMap[fullpath] = highlight;

          if (fullpath in prevMap) {
            delete prevMap[fullpath];
          }
          updatePaths.add(fullpath);
        }
      }

      for (const fullpath of Object.keys(prevMap)) {
        updatePaths.add(fullpath);
      }

      cache.highlightMap = localHighlightMap;
      return updatePaths;
    };

    const reload = async () => {
      await source.renderPaths(await load());
    };

    return {
      init() {
        subscriptions.push(
          source.diagnosticManager.onChange(debounce(1000, reload)),
        );
      },
      async load() {
        await load();
      },
      draw() {
        return {
          async drawNode(row, { node }) {
            if (node.directory) {
              const compactStore = source.getCompact(node);
              if (node.compacted && compactStore?.status === 'compacted') {
                row.add(
                  compactStore.nodes.map((n) => n.name).join(pathLib.sep),
                  {
                    hl:
                      cache.highlightMap[node.fullpath] ||
                      fileHighlights.directory,
                    unicode: true,
                  },
                );
              } else {
                row.add(node.name, {
                  hl:
                    cache.highlightMap[node.fullpath] ||
                    fileHighlights.directory,
                  unicode: true,
                });
              }
            } else {
              row.add(node.name, {
                hl:
                  cache.highlightMap[node.fullpath] || fileHighlights.filename,
                unicode: true,
              });
            }
          },
        };
      },
    };
  },
);
