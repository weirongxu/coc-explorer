import type { Color } from 'coc.nvim';
import colorConvert from 'color-convert';
import { minBy } from 'lodash-es';

/**
 * Create a color
 */
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

/**
 * Get distance between two colors
 */
export function colorDistance(c1: Color, c2: Color) {
  const rmean = (c1.red + c2.red) / 2;
  const r = c1.red - c2.red;
  const g = c1.green - c2.green;
  const b = c1.blue - c2.blue;
  return Math.sqrt(
    (((512 + rmean) * r * r) >> 8) + 4 * g * g + (((767 - rmean) * b * b) >> 8),
  );
}

/**
 * Get the closest color from a list of colors
 */
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

/**
 * Parse a hex color string
 */
export function parseColor(str: string) {
  str = str.trim();
  if (str[0] === '#') {
    str = str.slice(1);
  }
  const m = str.match(/.{1,2}/g);
  if (!m) return;

  const [r, g, b] = m;
  const ri = parseInt(r, 16);
  if (isNaN(ri)) return;
  const gi = parseInt(g, 16);
  if (isNaN(gi)) return;
  const bi = parseInt(b, 16);
  if (isNaN(bi)) return;
  return createColor(ri, gi, bi, 1);
}

/**
 * Convert a color to a hex string
 */
export function toHex(color: Color) {
  return colorConvert.rgb.hex(color.red, color.green, color.blue);
}
