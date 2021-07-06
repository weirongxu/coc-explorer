import { keyBy } from 'lodash-es';
import { ExplorerConfig } from '../config';
import { IconSourceType } from '../types';
import { getExtensions, logger, partition } from '../util';
import { getLoader } from './loader';
import { nerdfont } from './nerdfont';
import './load';
import { HighlightCommand } from '../highlight/types';
import { prettyPrint } from 'coc-helper';

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
  files: Record<string, IconInfo>;
  directories: Record<string, IconInfo>;
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
    files: {},
    directories: {},
  };
  for (const target of targets) {
    if (target.fullname in fullname2directoryIcon) {
      result.directories[target.fullname] =
        fullname2directoryIcon[target.fullname].icon;
    } else if (target.fullname in fullname2fileIcon) {
      result.files[target.fullname] = fullname2fileIcon[target.fullname].icon;
    } else if (target.isDirectory) {
      // get the defeault icon for directory
      const code = target.expanded
        ? nerdfont.icons.folderOpened.code
        : nerdfont.icons.folderClosed.code;
      result.directories[target.fullname] = {
        code,
      };
    } else {
      // get defeault icon for file
      const code = target.hidden
        ? nerdfont.icons.fileHidden.code
        : nerdfont.icons.file.code;
      result.files[target.fullname] = {
        code,
      };
    }
  }
  return result;
}

export async function loadIconsByConfig(
  config: ExplorerConfig,
  targets: IconTarget[],
) {
  const enabledVimDevicons = config.get('icon.enableVimDevicons');
  if (enabledVimDevicons) {
    logger.error(
      'The configuration `explorer.icon.enableVimDevicons` has been deprecated, please use `{"explorer.icon.enabledNerdFont": true, "explorer.icon.source": "vim-devicons"}` instead of it',
    );
    return loadIcons('vim-devicons', targets);
  }
  const enabledNerdFont = config.get('icon.enableNerdfont');
  if (!enabledNerdFont) {
    return;
  }
  const source = config.get('icon.source');
  return loadIcons(source, targets);
}
