import { keyBy } from 'lodash-es';
import type { ExplorerConfig } from '../config';
import type { HighlightCommand } from '../highlight/types';
import type { IconSourceType } from '../types';
import { getExtensions, hasOwnProperty, logger, partition } from '../util';
import './load';
import { getLoader } from './loader';
import { nerdfont } from './nerdfont';

export type IconTarget = {
  fullname: string;
  isDirectory: boolean;
  hidden: boolean;
  expanded?: boolean;
};

export type IconParsedTarget = {
  basename: string;
  extensions: string[];
} & IconTarget;

export type IconInfo = {
  code: string;
  name?: string;
  color?: string;
  highlight?: string | HighlightCommand;
};

export type IconLoadedResult = {
  files: Map<string, IconInfo>;
  directories: Map<string, IconInfo>;
};

export type IconInternalLoadedItem = {
  target: IconParsedTarget;
  icon: IconInfo;
};

function parseTargets(targets: IconTarget[]): IconParsedTarget[] {
  return targets.map((target) => {
    return {
      fullname: target.fullname,
      ...getExtensions(target.fullname.toLowerCase()),
      isDirectory: target.isDirectory,
      hidden: target.hidden,
      expanded: target.expanded,
    };
  });
}

export async function loadIcons(
  sourceType: IconSourceType,
  targets: IconTarget[],
) {
  const parsedTargets = parseTargets(targets);
  const loader = getLoader(sourceType);
  if (!loader) {
    return;
  }
  const loadedIcons = await loader.loadIcons(parsedTargets);
  const [directoryIcons, fileIcons] = partition(
    loadedIcons,
    (it) => it.target.isDirectory,
  );
  const fullname2directoryIcon = keyBy(
    directoryIcons,
    (it) => it.target.fullname,
  );
  const fullname2fileIcon = keyBy(fileIcons, (it) => it.target.fullname);
  const result: IconLoadedResult = {
    files: new Map(),
    directories: new Map(),
  };
  for (const target of targets) {
    if (hasOwnProperty(fullname2directoryIcon, target.fullname)) {
      const item = fullname2directoryIcon[target.fullname];
      if (item) result.directories.set(target.fullname, item.icon);
    } else if (hasOwnProperty(fullname2fileIcon, target.fullname)) {
      const item = fullname2fileIcon[target.fullname];
      if (item) result.files.set(target.fullname, item.icon);
    } else if (target.isDirectory) {
      // get the defeault icon for directory
      const code = target.expanded
        ? nerdfont.icons.folderOpened?.code
        : nerdfont.icons.folderClosed?.code;
      if (code)
        result.directories.set(target.fullname, {
          code,
        });
    } else {
      // get defeault icon for file
      const code = target.hidden
        ? nerdfont.icons.fileHidden?.code
        : nerdfont.icons.file?.code;
      if (code) result.files.set(target.fullname, { code });
    }
  }
  return result;
}

export async function loadIconsByConfig(
  config: ExplorerConfig,
  targets: IconTarget[],
) {
  const enabledNerdFont = config.get('icon.enableNerdfont');
  if (!enabledNerdFont) {
    return;
  }
  const source = config.get('icon.source');
  return loadIcons(source, targets);
}
