import type { IconSourceType } from '../types';
import type { IconInternalLoadedItem, IconParsedTarget } from './icons';

export abstract class IconLoader {
  abstract loadIcons(
    arg: IconParsedTarget[],
  ): Promise<IconInternalLoadedItem[]>;
}

const getLoaders: Record<string, () => IconLoader> = {};

export function registerLoader(
  iconSourceType: IconSourceType,
  getLoader: () => IconLoader,
) {
  getLoaders[iconSourceType] = getLoader;
}

const loadersCache = new Map<IconSourceType, IconLoader>();

export function getLoader(source: IconSourceType) {
  if (!loadersCache.has(source)) {
    const getLoader = getLoaders[source];
    if (!getLoader) {
      return;
    }
    loadersCache.set(source, getLoader());
  }
  return loadersCache.get(source)!;
}
