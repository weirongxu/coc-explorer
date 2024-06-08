import { loadIconsByConfig, type IconTarget } from '../../../../icon/icons';
import { nerdfontHighlights } from '../../../../icon/nerdfont';
import type { ColumnDrawHandle } from '../../../columnRegistrar';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights, type FileNode } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'icon', ({ source }) => ({
  async draw(nodes): Promise<ColumnDrawHandle<FileNode>> {
    const iconTargets: IconTarget[] = nodes.map((node) => ({
      fullname: node.compactedLastNode?.name ?? node.name,
      hidden: node.hidden,
      isDirectory: node.directory,
      expanded: node.directory ? source.view.isExpanded(node) : undefined,
    }));
    const icons = await loadIconsByConfig(source.config, iconTargets);

    return {
      async drawNode(row, { node }) {
        if (node.directory) {
          const hl = source.view.isExpanded(node)
            ? fileHighlights.directoryExpanded
            : fileHighlights.directoryCollapsed;
          const icon = icons?.directories.get(
            node.compactedLastNode?.name ?? node.name,
          );
          if (icon) {
            row.add(icon.code, { hl });
          } else {
            row.add(
              source.view.isExpanded(node)
                ? source.icons.expanded
                : source.icons.collapsed,
              { hl },
            );
          }
        } else {
          const icon = icons?.files.get(node.name);
          if (icon) {
            row.add(icon.code, {
              hl: icon.highlight ?? nerdfontHighlights.get('file'),
            });
          }
        }
      },
    };
  },
}));
