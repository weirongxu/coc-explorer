import nerdfontJson from './icons.nerdfont.json';
import { hlGroupManager } from '../highlight/manager';
import { getExtensions, parseColor } from '../util';
import { config } from '../config';
import convert from 'color-convert';
import { HighlightCommand } from '../highlight/types';

export interface NerdFontOption {
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
  const color = parseColor(icon.color);
  if (!color) {
    return;
  }
  const ansiColor = convert.rgb.ansi256([color.red, color.green, color.blue]);
  const hlExpr = `ctermfg=${ansiColor} guifg=${icon.color}`;
  nerdfontHighlights[name] = hlGroupManager.group(
    `FileIconNerdfont_${name}`,
    hlExpr,
  );
});

export function getFileIcon(
  originalFilename: string,
): undefined | { name: string; code: string; color: string } {
  const filename = originalFilename.toLowerCase();
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

  const matched = Object.entries(
    nerdfont.patternMatches,
  ).find(([pattern]: [string, string]) => new RegExp(pattern).test(filename));
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

export function getDirectoryIcon(
  originalDirname: string,
): undefined | { name: string; code: string; color: string } {
  const dirname = originalDirname.toLowerCase();
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

  const matched = Object.entries(
    nerdfont.dirPatternMatches,
  ).find(([pattern]: [string, string]) => new RegExp(pattern).test(dirname));
  if (matched) {
    const name = matched[1];
    return {
      name,
      ...nerdfont.icons[name],
    };
  }
}
