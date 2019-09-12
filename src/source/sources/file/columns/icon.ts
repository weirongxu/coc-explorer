import { expandStore } from '..';
import { fileColumnManager } from '../column-manager';
import { sourceIcons } from '../../..';
import pathLib from 'path';
// reference:
//   icon code from https://github.com/ryanoasis/vim-devicons/blob/830f0fe48a337ed26384c43929032786f05c8d24/plugin/webdevicons.vim#L129
//   icon color from https://github.com/microsoft/vscode/blob/e75e71f41911633be838344377df26842f2b8c7c/extensions/theme-seti/icons/vs-seti-icon-theme.json
import nerdfontJson from './icons.nerdfont.json';
import { highlights as filenameHighlights } from './filename';
import { hlGroupManager, HighlightCommand } from '../../../highlight-manager';

const nerdfont = nerdfontJson as {
  icons: Record<
    string,
    {
      code: string;
      color: string;
    }
  >;
  extensions: Record<string, string>;
  filenames: Record<string, string>;
  patternMatches: Record<string, string>;
};

export const nerdfontHighlights: Record<string, HighlightCommand> = {};

Object.entries(nerdfontJson.icons).forEach(([name, icon]) => {
  nerdfontHighlights[name] = hlGroupManager.hlGroupCommand(`FileIconNerdfont_${name}`, `guifg=${icon.color}`);
});

hlGroupManager.register(nerdfontHighlights);

const enableNerdfont = fileColumnManager.getColumnConfig<string>('icon.enableNerdfont');
const space = ' '.repeat(sourceIcons.shrinked.length);

const getIcon = (filename: string): undefined | { name: string; code: string; color: string } => {
  const ext = pathLib.extname(filename);
  const extname = ext.slice(1);
  const basename = pathLib.basename(filename, ext);

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
};

fileColumnManager.registerColumn('icon', {
  draw(row, item) {
    if (item.directory) {
      if (enableNerdfont) {
        row.add(
          expandStore.isExpanded(item.fullpath)
            ? nerdfontJson.icons.folderOpened.code
            : nerdfontJson.icons.folderClosed.code,
          filenameHighlights.directory.group,
        );
      } else {
        row.add(
          expandStore.isExpanded(item.fullpath) ? sourceIcons.expanded : sourceIcons.shrinked,
          filenameHighlights.directory.group,
        );
      }
      row.add(' ');
    } else {
      if (enableNerdfont) {
        const icon = getIcon(item.name.toLowerCase());
        if (icon) {
          row.add(icon.code, nerdfontHighlights[icon.name].group);
        } else {
          row.add(space);
        }
      } else {
        row.add(space);
      }
      row.add(' ');
    }
  },
});
