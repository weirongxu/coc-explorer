import { expandStore } from '..';
import { fileColumnManager } from '../column-manager';
import { sourceIcons } from '../../..';
import pathLib from 'path';
// reference:
//   icons from https://github.com/ryanoasis/vim-devicons/blob/830f0fe48a337ed26384c43929032786f05c8d24/plugin/webdevicons.vim#L129
//   color from VSCode seti theme
import nerdfontIcons from './icons.nerdfont.json';

const icons = nerdfontIcons as {
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

const enableNerdfont = fileColumnManager.getColumnConfig<string>('icon.enableNerdfont');
const space = ' '.repeat(sourceIcons.shrinked.length);

const getIcon = (filename: string): undefined | { code: string; color: string } => {
  const ext = pathLib.extname(filename);
  const extname = ext.slice(1);
  const basename = pathLib.basename(filename, ext);
  if (extname in icons.extensions) {
    return icons.icons[icons.extensions[extname]];
  } else if (basename in icons.filenames) {
    return icons.icons[icons.filenames[basename]];
  } else if (filename in icons.filenames) {
    return icons.icons[icons.filenames[filename]];
  } else {
    const matched = Object.entries(icons.patternMatches).find(
      ([pattern]: [string, string]) => new RegExp(pattern).test(filename),
    );
    if (matched) {
      return icons.icons[matched[1]];
    }
  }
};

fileColumnManager.registerColumn('icon', {
  draw(row, item) {
    if (item.directory) {
      row.add(expandStore.isExpanded(item.fullpath) ? sourceIcons.expanded : sourceIcons.shrinked);
      row.add(' ');
    } else {
      if (enableNerdfont) {
        const icon = getIcon(item.name);
        if (icon) {
          row.add(icon.code);
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
