import { fileColumnRegistrar } from '../file-column-registrar';
import { sourceIcons } from '../../../source';
import nerdfontJson from './icons.nerdfont.json';
import { hlGroupManager, HighlightCommand } from '../../../highlight-manager';
import { config, getExtensions, getEnableNerdfont } from '../../../../util';
import { workspace } from 'coc.nvim';
import { FileNode, fileHighlights } from '../file-source';
import { getSymbol } from '../../../../util/symbol';

const enableVimDevicons = config.get<boolean>('icon.enableVimDevicons')!;

interface NerdFontOption {
  icons?: Record<
    string,
    {
      code: string;
      color: string;
    }
  >;
  extensions?: Record<string, string>;
  filenames?: Record<string, string>;
  dirnames?: Record<string, string>;
  patternMatches?: Record<string, string>;
  dirPatternMatches?: Record<string, string>;
}
type NerdFont = Required<NerdFontOption>;

export const nerdfont = nerdfontJson as NerdFont;
const customIcon = config.get<NerdFontOption>('icon.customIcons', {})!;
Object.assign(nerdfont.icons, customIcon.icons);
Object.assign(nerdfont.extensions, customIcon.extensions);
Object.assign(nerdfont.filenames, customIcon.filenames);
Object.assign(nerdfont.dirnames, customIcon.dirnames);
Object.assign(nerdfont.patternMatches, customIcon.patternMatches);
Object.assign(nerdfont.dirPatternMatches, customIcon.dirPatternMatches);

export const nerdfontHighlights: Record<string, HighlightCommand> = {};
Object.entries(nerdfont.icons).forEach(([name, icon]) => {
  nerdfontHighlights[name] = hlGroupManager.group(
    `FileIconNerdfont_${name}`,
    `guifg=${icon.color}`,
  );
});

function getFileIcon(node: FileNode): undefined | { name: string; code: string; color: string } {
  const filename = node.name.toLowerCase();
  const { extensions, basename } = getExtensions(filename);
  const extname = extensions[extensions.length - 1];

  if (nerdfont.filenames.hasOwnProperty(basename)) {
    const name = nerdfont.filenames[basename];
    return {
      name,
      ...nerdfont.icons[name],
    };
  }

  if (nerdfont.filenames.hasOwnProperty(filename)) {
    const name = nerdfont.filenames[filename];
    return {
      name,
      ...nerdfont.icons[name],
    };
  }

  const matched = Object.entries(nerdfont.patternMatches).find(([pattern]: [string, string]) =>
    new RegExp(pattern).test(filename),
  );
  if (matched) {
    const name = matched[1];
    return {
      name,
      ...nerdfont.icons[name],
    };
  }

  if (nerdfont.extensions.hasOwnProperty(extname)) {
    const name = nerdfont.extensions[extname];
    return {
      name,
      ...nerdfont.icons[name],
    };
  }
}

function getDirIcon(node: FileNode): undefined | { name: string; code: string; color: string } {
  const dirname = node.name.toLowerCase();
  const { basename } = getExtensions(dirname);

  if (nerdfont.dirnames.hasOwnProperty(basename)) {
    const name = nerdfont.dirnames[basename];
    return {
      name,
      ...nerdfont.icons[name],
    };
  }

  if (nerdfont.dirnames.hasOwnProperty(dirname)) {
    const name = nerdfont.dirnames[dirname];
    return {
      name,
      ...nerdfont.icons[name],
    };
  }

  const matched = Object.entries(nerdfont.dirPatternMatches).find(([pattern]: [string, string]) =>
    new RegExp(pattern).test(dirname),
  );
  if (matched) {
    const name = matched[1];
    return {
      name,
      ...nerdfont.icons[name],
    };
  }
}

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
          getAttr(node).devicons = await workspace.nvim.call('WebDevIconsGetFileTypeSymbol', [
            node.name,
            node.directory,
          ]);
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
          const icon = getDirIcon(node);
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
        const icon = getFileIcon(node);
        if (icon && enableVimDevicons) {
          icon.code = getAttr(node).devicons;
        }
        if (icon) {
          row.add(icon.code, { hl: nerdfontHighlights[icon.name] });
        } else if (node.hidden) {
          row.add(nerdfont.icons.fileHidden.code, { hl: nerdfontHighlights['fileHidden'] });
        } else {
          row.add(nerdfont.icons.file.code, { hl: nerdfontHighlights['file'] });
        }
      }
    }
  },
}));
