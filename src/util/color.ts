import { Color } from 'coc.nvim';
import colorConvert from 'color-convert';
import { minBy } from 'lodash-es';

export function createColor(
  /**
   * The red component of this color in the range [0-1].
   */
  red: number,
  /**
   * The green component of this color in the range [0-1].
   */
  green: number,
  /**
   * The blue component of this color in the range [0-1].
   */
  blue: number,
  /**
   * The alpha component of this color in the range [0-1].
   */
  alpha: number,
): Color {
  return { red, green, blue, alpha };
}

export function colorDistance(c1: Color, c2: Color) {
  const rmean = (c1.red + c2.red) / 2;
  const r = c1.red - c2.red;
  const g = c1.green - c2.green;
  const b = c1.blue - c2.blue;
  return Math.sqrt(
    (((512 + rmean) * r * r) >> 8) + 4 * g * g + (((767 - rmean) * b * b) >> 8),
  );
}

export function findNearestColor(color: Color, list: Color[]): Color;
export function findNearestColor<T>(
  color: Color,
  list: T[],
  getColor: (it: T) => Color,
): T;
export function findNearestColor<T>(
  color: Color,
  list: T[],
  getColor: (it: T) => Color = (it) => it as unknown as Color,
) {
  return minBy(list, (it) => colorDistance(getColor(it), color));
}

export function parseColor(str: string) {
  str = str.trim();
  if (str[0] === '#') {
    str = str.slice(1);
  }
  const m = str.match(/.{1,2}/g);
  if (!m) {
    return;
  }
  const [r, g, b] = m;
  return createColor(parseInt(r, 16), parseInt(g, 16), parseInt(b, 16), 1);
}

export function toHex(color: Color) {
  return colorConvert.rgb.hex(color.red, color.green, color.blue);
}
