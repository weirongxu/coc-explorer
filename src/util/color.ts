import { minBy } from 'lodash-es';
import { Color } from 'vscode-languageserver-protocol';
import colorConvert from 'color-convert';

export function colorDistance(c1: Color, c2: Color) {
  const rmean = (c1.red + c2.red) / 2;
  const r = c1.red - c2.red;
  const g = c1.green - c2.green;
  const b = c1.blue - c2.blue;
  return Math.sqrt(
    (((512 + rmean) * r * r) >> 8) + 4 * g * g + (((767 - rmean) * b * b) >> 8),
  );
}

export function findNearestColor(color: Color, list: Color[]) {
  return minBy(list, (c) => colorDistance(c, color));
}

export function parseColor(str: string) {
  str = str.trim();
  if (str[0] === '#') {
    str = str.slice(1);
  }
  const m = str.match(/.{1,2}/g);
  if (m) {
    const [r, g, b] = m;
    return Color.create(parseInt(r, 16), parseInt(g, 16), parseInt(b, 16), 1);
  }
}

export function toHex(color: Color) {
  return colorConvert.rgb.hex(color.red, color.green, color.blue);
}
