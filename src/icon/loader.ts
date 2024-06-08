import type { IconSourceType } from '../types';
import type { IconInternalLoadedItem, IconParsedTarget } from './icons';

export abstract class IconLoader {
  abstract loadIcons(
    arg: IconParsedTarget[],
  ): Promise<IconInternalLoadedItem[]>;
}

const getLoaders = new Map<string, () => IconLoader>();

export function registerLoader(
  iconSourceType: IconSourceType,
  getLoader: () => IconLoader,
) {
  getLoaders.set(iconSourceType, getLoader);
}

const loadersCache = new Map<IconSourceType, IconLoader>();

export function getLoader(source: IconSourceType) {
  if (!loadersCache.has(source)) {
    const getLoader = getLoaders.get(source);
    if (!getLoader) {
      return;
    }
    loadersCache.set(source, getLoader());
  }
  return loadersCache.get(source)!;
}
