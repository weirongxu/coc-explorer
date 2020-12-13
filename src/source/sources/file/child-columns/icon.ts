import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { workspace } from 'coc.nvim';
import { FileNode, fileHighlights } from '../fileSource';
import { getSymbol } from '../../../../util/symbol';
import {
  getFileIcon,
  getDirectoryIcon,
  nerdfont,
  nerdfontHighlights,
} from '../../../../icon/icons';
import { ColumnDrawHandle } from '../../../columnRegistrar';

const attrSymbol = Symbol('icon-column');

function nodeSymbol(node: FileNode) {
  return getSymbol(node, attrSymbol, () => ({
    devicons: '',
  }));
}

fileColumnRegistrar.registerColumn('child', 'icon', ({ source }) => ({
  async draw(nodes): Promise<ColumnDrawHandle<FileNode>> {
    const enabledVimDevicons = source.config.get('icon.enableVimDevicons');
    const enabledNerdFont = source.config.get('icon.enableNerdfont');

    if (enabledVimDevicons) {
      await Promise.all(
        nodes.map(async (node) => {
          nodeSymbol(
            node,
          ).devicons = await workspace.nvim.call(
            'WebDevIconsGetFileTypeSymbol',
            [node.name, node.directory],
          );
        }),
      );
    }

    return {
      async drawNode(row, { node }) {
        if (node.directory) {
          const hl = source.view.isExpanded(node)
            ? fileHighlights.directoryExpanded
            : fileHighlights.directoryCollapsed;
          if (enabledVimDevicons) {
            row.add(nodeSymbol(node).devicons, { hl });
          } else if (enabledNerdFont) {
            const icon = getDirectoryIcon(node.name);
            if (icon) {
              row.add(icon.code, { hl });
            } else {
              row.add(
                source.view.isExpanded(node)
                  ? nerdfont.icons.folderOpened.code
                  : nerdfont.icons.folderClosed.code,
                { hl },
              );
            }
          } else {
            row.add(
              source.view.isExpanded(node)
                ? source.icons.expanded
                : source.icons.collapsed,
              { hl: fileHighlights.directory },
            );
          }
        } else {
          if (enabledVimDevicons) {
            const code = nodeSymbol(node).devicons;
            row.add(code, { hl: nerdfontHighlights['file'] });
          } else if (enabledNerdFont) {
            const icon = getFileIcon(node.name);
            if (icon) {
              row.add(icon.code, { hl: nerdfontHighlights[icon.name] });
            } else if (node.hidden) {
              row.add(nerdfont.icons.fileHidden.code, {
                hl: nerdfontHighlights['fileHidden'],
              });
            } else {
              row.add(nerdfont.icons.file.code, {
                hl: nerdfontHighlights['file'],
              });
            }
          }
        }
      },
    };
  },
}));
