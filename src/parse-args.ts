import { config, normalizePath, splitCount } from './util';
import { workspace } from 'coc.nvim';

export interface ArgsSource {
  name: string;
  expand: boolean;
}

export type ArgPosition = 'tab' | 'left' | 'right' | 'floating';

type OptionType = 'boolean' | 'string';

type ArgOption<T> = {
  type: OptionType;
  name: string;
  handler?: (value: string) => Promise<T> | T;
  getDefault?: () => Promise<T> | T;
  description?: string;
};

type ArgOptionRequired<T> = {
  type: OptionType;
  name: string;
  handler?: (value: string) => Promise<T> | T;
  getDefault: () => Promise<T> | T;
  description?: string;
};

export class Args {
  private static registeredOptions: Map<string, ArgOption<any>> = new Map();
  private static registeredPositional = {
    name: 'rootPath',
    handler: (path: string) => normalizePath(path),
    getDefault: async () => {
      let useGetcwd = false;
      const buftype = await workspace.nvim.getVar('&buftype');
      if (buftype === 'nofile') {
        useGetcwd = true;
      } else {
        const bufname = await workspace.nvim.call('bufname', ['%']);
        if (!bufname) {
          useGetcwd = true;
        }
      }
      const rootPath = useGetcwd
        ? ((await workspace.nvim.call('getcwd', [])) as string)
        : workspace.rootPath;
      return normalizePath(rootPath);
    },
    description: 'Explorer root',
  };

  private optionValues: Map<string, any> = new Map();
  private rootPathValue?: string;

  static registerOption<T>(
    name: string,
    options: {
      handler?: (value: string) => T | Promise<T>;
      getDefault: () => T | Promise<T>;
    },
  ): ArgOptionRequired<T>;
  static registerOption<T>(
    name: string,
    options: {
      handler?: (value: string) => T | Promise<T>;
    },
  ): ArgOption<T>;
  static registerOption<T>(
    name: string,
    options: {
      handler?: (value: string) => T | Promise<T>;
      getDefault?: () => T | Promise<T>;
    },
  ): ArgOption<T> | ArgOptionRequired<T> {
    const option = {
      type: 'string' as const,
      name,
      ...options,
    };
    this.registeredOptions.set(name, option);
    return option;
  }

  static registerBoolOption(name: string, defaultValue: boolean): ArgOptionRequired<boolean> {
    const option = {
      type: 'boolean' as const,
      name,
      getDefault: () => defaultValue,
    };
    this.registeredOptions.set(name, option);
    this.registeredOptions.set('no-' + name, option);
    return option;
  }

  static async parse(strArgs: string[]) {
    const self = new Args(strArgs);
    const args = [...strArgs];

    while (args.length > 0) {
      const arg = args.shift()!;
      if (arg.startsWith('--')) {
        let key: string, value: undefined | string;

        if (/^--[\w-]+=/.test(arg)) {
          [key, value] = splitCount(arg.slice(2), '=', 2);
        } else {
          key = arg.slice(2);
        }

        const option = this.registeredOptions.get(key);

        if (option) {
          if (!value) {
            if (option.type === 'boolean') {
              self.optionValues.set(option.name, !key.startsWith('no-'));
              continue;
            } else {
              value = args.shift()!;
            }
          }
          if (value !== undefined) {
            self.optionValues.set(
              option.name,
              option.handler ? await option.handler(value) : value,
            );
            continue;
          }
        }
      }

      self.rootPathValue = this.registeredPositional.handler(arg);
    }

    return self;
  }

  constructor(public readonly args: string[]) {}

  has(option: ArgOption<any>): boolean {
    return this.optionValues.has(option.name);
  }

  async value<T>(option: ArgOptionRequired<T>): Promise<T>;
  async value<T>(option: ArgOption<T>): Promise<T | undefined>;
  async value<T>(option: ArgOption<T>): Promise<T | undefined> {
    if (this.optionValues.has(option.name)) {
      return this.optionValues.get(option.name);
    } else {
      if (!Args.registeredOptions.has(option.name)) {
        throw new Error(`Argument(${option.name}) not found`);
      } else {
        return await Args.registeredOptions.get(option.name)?.getDefault?.();
      }
    }
  }

  async rootPath() {
    if (this.rootPathValue === undefined) {
      return await Args.registeredPositional.getDefault();
    } else {
      return this.rootPathValue;
    }
  }
}

type floatingPositionEnum = 'left-center' | 'right-center' | 'center';

export const argOptions = {
  toggle: Args.registerBoolOption('toggle', true),
  sources: Args.registerOption('sources', {
    handler: (sources) =>
      sources.split(',').map((source) => {
        let expand = false;
        let name: string;
        if (source.endsWith('+')) {
          expand = true;
          name = source.slice(0, source.length - 1);
        } else if (source.endsWith('-')) {
          expand = false;
          name = source.slice(0, source.length - 1);
        } else {
          name = source;
        }
        return {
          name,
          expand,
        };
      }),
    getDefault: () => config.get<ArgsSource[]>('sources')!,
  }),
  position: Args.registerOption<ArgPosition>('position', {
    getDefault: () => config.get<ArgPosition>('position')!,
  }),
  width: Args.registerOption('width', {
    handler: (s) => parseInt(s, 10),
    getDefault: () => config.get<number>('width')!,
  }),
  floatingWidth: Args.registerOption('floating-width', {
    handler: (s) => parseInt(s, 10),
    getDefault: () => config.get<number>('floating.width')!,
  }),
  floatingHeight: Args.registerOption('floating-height', {
    handler: (s) => parseInt(s, 10),
    getDefault: () => config.get<number>('floating.height')!,
  }),
  floatingPosition: Args.registerOption<floatingPositionEnum | [number, number]>(
    'floating-position',
    {
      handler: (s) => {
        if (['left-center', 'right-center', 'center'].includes(s)) {
          return s as floatingPositionEnum;
        } else {
          return s.split(',').map((i) => parseInt(i, 10)) as [number, number];
        }
      },
      getDefault: () => config.get<floatingPositionEnum | [number, number]>('floating.position')!,
    },
  ),
  bufferRootTemplate: Args.registerOption<string>('buffer-root-template', {
    getDefault: () => config.get<string>('buffer.root.template')!,
  }),
  bufferChildTemplate: Args.registerOption<string>('buffer-child-template', {
    getDefault: () => config.get<string>('buffer.child.template')!,
  }),
  bufferChildLabelingTemplate: Args.registerOption<string>('buffer-child-labeling-template', {
    getDefault: () => config.get<string>('buffer.child.labelingTemplate')!,
  }),
  fileRootTemplate: Args.registerOption<string>('file-root-template', {
    getDefault: () => config.get<string>('file.root.template')!,
  }),
  fileRootLabelingTemplate: Args.registerOption<string>('file-root-labeling-template', {
    getDefault: () => config.get<string>('file.root.labelingTemplate')!,
  }),
  fileChildTemplate: Args.registerOption<string>('file-child-template', {
    getDefault: () => config.get<string>('file.child.template')!,
  }),
  fileChildLabelingTemplate: Args.registerOption<string>('file-child-labeling-template', {
    getDefault: () => config.get<string>('file.child.labelingTemplate')!,
  }),
  reveal: Args.registerOption('reveal', {
    handler: normalizePath,
  }),
};

// export function parseColumns(columnsStr: string) {
//   const semicolonIndex = columnsStr.indexOf(';');
//   if (semicolonIndex === -1) {
//     return columnsStr.split(/:/);
//   } else {
//     return [
//       ...columnsStr
//         .slice(0, semicolonIndex)
//         .split(':')
//         .concat(),
//       ...columnsStr
//         .slice(semicolonIndex + 1)
//         .split(';')
//         .map((c) => c.split(':')),
//     ];
//   }
// }
