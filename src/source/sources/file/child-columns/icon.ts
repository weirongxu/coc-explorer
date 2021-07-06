import { IconTarget, loadIconsByConfig } from '../../../../icon/icons';
import { nerdfontHighlights } from '../../../../icon/nerdfont';
import { ColumnDrawHandle } from '../../../columnRegistrar';
import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { fileHighlights, FileNode } from '../fileSource';

fileColumnRegistrar.registerColumn('child', 'icon', ({ source }) => ({
  async draw(nodes): Promise<ColumnDrawHandle<FileNode>> {
    const iconTargets: IconTarget[] = nodes.map((node) => ({
      fullname: node.name,
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
          const icon = icons?.directories[node.name];
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
          const icon = icons?.files[node.name];
          if (icon) {
            row.add(icon.code, {
              hl: icon.highlight ?? nerdfontHighlights.file,
            });
          }
        }
      },
    };
  },
}));
