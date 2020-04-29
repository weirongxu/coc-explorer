import { fileColumnRegistrar } from '../fileColumnRegistrar';
import { sourceIcons } from '../../../source';
import { config, getEnableNerdfont } from '../../../../util';
import { workspace } from 'coc.nvim';
import { FileNode, fileHighlights } from '../fileSource';
import { getSymbol } from '../../../../util/symbol';
import {
  getFileIcon,
  getDirectoryIcon,
  nerdfont,
  nerdfontHighlights,
} from '../../../../icons';

const enableVimDevicons = config.get<boolean>('icon.enableVimDevicons')!;

const attrSymbol = Symbol('icon-column');

function getAttr(node: FileNode) {
  return getSymbol(node, attrSymbol, () => ({
    devicons: '',
  }));
}

fileColumnRegistrar.registerColumn('child', 'icon', ({ source }) => ({
  async beforeDraw(nodes) {
    if (enableVimDevicons) {
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
    if (node.directory) {
      const hl = source.expandStore.isExpanded(node)
        ? fileHighlights.directoryExpanded
        : fileHighlights.directoryCollapsed;
      if (getEnableNerdfont()) {
        if (enableVimDevicons) {
          row.add(getAttr(node).devicons, { hl });
        } else {
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
        }
      } else {
        row.add(
          source.expandStore.isExpanded(node)
            ? sourceIcons.getExpanded()
            : sourceIcons.getCollapsed(),
          { hl: fileHighlights.directory },
        );
      }
    } else {
      if (getEnableNerdfont()) {
        const icon = getFileIcon(node.name);
        if (icon && enableVimDevicons) {
          icon.code = getAttr(node).devicons;
        }
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
