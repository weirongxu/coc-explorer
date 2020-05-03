import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { workspace } from 'coc.nvim';
import { FileNode, fileHighlights } from '../fileSource';
import { getSymbol } from '../../../../util/symbol';
import {
  getFileIcon,
  getDirectoryIcon,
  nerdfont,
  nerdfontHighlights,
} from '../../../../icons';

const attrSymbol = Symbol('icon-column');

function getAttr(node: FileNode) {
  return getSymbol(node, attrSymbol, () => ({
    devicons: '',
  }));
}

fileColumnRegistrar.registerColumn('child', 'icon', ({ source }) => ({
  async beforeDraw(nodes) {
    if (source.config.enableVimDevicons) {
      await Promise.all(
        nodes.map(async (node) => {
          getAttr(
            node,
          ).devicons = await workspace.nvim.call(
            'WebDevIconsGetFileTypeSymbol',
            [node.name, node.directory],
          );
        }),
      );
    }
  },
  async draw(row, node) {
    const enabledVimDevicons = source.config.enableVimDevicons;
    const enabledNerdFont = source.config.getEnableNerdfont;
    if (node.directory) {
      const hl = source.expandStore.isExpanded(node)
        ? fileHighlights.directoryExpanded
        : fileHighlights.directoryCollapsed;
      if (enabledVimDevicons) {
        row.add(getAttr(node).devicons, { hl });
      } else if (enabledNerdFont) {
        const icon = getDirectoryIcon(node.name);
        if (icon) {
          row.add(icon.code, { hl });
        } else {
          row.add(
            source.expandStore.isExpanded(node)
              ? nerdfont.icons.folderOpened.code
              : nerdfont.icons.folderClosed.code,
            { hl },
          );
        }
      } else {
        row.add(
          source.expandStore.isExpanded(node)
            ? source.icons.expanded
            : source.icons.collapsed,
          { hl: fileHighlights.directory },
        );
      }
    } else {
      if (enabledVimDevicons) {
        const code = getAttr(node).devicons;
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
          row.add(nerdfont.icons.file.code, { hl: nerdfontHighlights['file'] });
        }
      }
    }
  },
}));
