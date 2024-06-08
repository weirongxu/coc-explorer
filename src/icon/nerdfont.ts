import convert from 'color-convert';
import { config } from '../config';
import { hlGroupManager } from '../highlight/manager';
import type { HighlightCommand } from '../highlight/types';
import { parseColor } from '../util';
import nerdfontJson from './icons.nerdfont.json';

export interface NerdFontOption {
  icons?: Record<
    string,
    | {
        code: string;
        color: string;
      }
    | undefined
  >;
  extensions?: Record<string, string>;
  filenames?: Record<string, string>;
  dirnames?: Record<string, string>;
  patternMatches?: Record<string, string>;
  dirPatternMatches?: Record<string, string>;
}
type NerdFont = Required<NerdFontOption>;

export const nerdfont = nerdfontJson as NerdFont;
const customIcon = config.get<NerdFontOption>('icon.customIcons', {});
Object.assign(nerdfont.icons, customIcon.icons);
Object.assign(nerdfont.extensions, customIcon.extensions);
Object.assign(nerdfont.filenames, customIcon.filenames);
Object.assign(nerdfont.dirnames, customIcon.dirnames);
Object.assign(nerdfont.patternMatches, customIcon.patternMatches);
Object.assign(nerdfont.dirPatternMatches, customIcon.dirPatternMatches);

export const nerdfontHighlights = new Map<string, HighlightCommand>();
Object.entries(nerdfont.icons).forEach(([name, icon]) => {
  if (!icon) return;
  const color = parseColor(icon.color);
  if (!color) return;
  const ansiColor = convert.rgb.ansi256([color.red, color.green, color.blue]);
  const hlExpr = `ctermfg=${ansiColor} guifg=${icon.color}`;
  nerdfontHighlights.set(
    name,
    hlGroupManager.createGroup(`FileIconNerdfont_${name}`, hlExpr),
  );
});
