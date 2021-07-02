import { IconInfo, IconInternalLoadedItem, IconParsedTarget } from '../icons';
import { IconLoader, registerLoader } from '../loader';
import { nerdfont, nerdfontHighlights } from '../nerdfont';

export class BuiltinIconLoader extends IconLoader {
  async loadIcons(
    targets: IconParsedTarget[],
  ): Promise<IconInternalLoadedItem[]> {
    const loaded: IconInternalLoadedItem[] = [];
    for (const target of targets) {
      const icon = target.isDirectory
        ? this.getDirectoryIcon(target)
        : this.getFileIcon(target);
      if (icon) {
        icon.highlight = nerdfontHighlights[icon.name]?.group;
        loaded.push({
          icon,
          target,
        });
      }
    }
    return loaded;
  }

  getFileIcon(
    target: IconParsedTarget,
  ): undefined | (IconInfo & { name: string }) {
    const { fullname, basename, extensions } = target;
    const extname = extensions[extensions.length - 1];
    if (nerdfont.filenames.hasOwnProperty(basename)) {
      const name = nerdfont.filenames[basename];
      return {
        name,
        ...nerdfont.icons[name],
      };
    }

    if (nerdfont.filenames.hasOwnProperty(fullname)) {
      const name = nerdfont.filenames[fullname];
      return {
        name,
        ...nerdfont.icons[name],
      };
    }

    const matched = Object.entries(
      nerdfont.patternMatches,
    ).find(([pattern]: [string, string]) => new RegExp(pattern).test(fullname));
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

  getDirectoryIcon(
    target: IconParsedTarget,
  ): undefined | (IconInfo & { name: string }) {
    const { basename, fullname: dirname } = target;

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
}

registerLoader('builtin', () => new BuiltinIconLoader());
