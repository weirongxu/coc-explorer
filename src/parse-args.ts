import { config, normalizePath, splitCount } from './util';
import { workspace } from 'coc.nvim';
import { getPresets } from './presets';
import { OpenStrategy } from './types';

export interface ArgsSource {
  name: string;
  expand: boolean;
}

export type ArgPosition = 'tab' | 'left' | 'right' | 'floating';

type OptionType = 'boolean' | 'string' | 'positional';

type ArgOption<T> = {
  type: OptionType;
  name: string;
  position?: number;
  parseArg?: (value: string) => Promise<T> | T;
  handler?: (value: T | undefined) => Promise<T | undefined> | T | undefined;
  getDefault?: () => Promise<T> | T;
  description?: string;
};

type ArgOptionRequired<T> = {
  type: OptionType;
  name: string;
  position?: number;
  parseArg?: (value: string) => Promise<T> | T;
  handler?: (value: T) => Promise<T> | T;
  getDefault: () => Promise<T> | T;
  description?: string;
};

export type ArgContentWidthTypes = 'win-width' | 'vim-width';

export type ArgFloatingPositions = 'left-center' | 'right-center' | 'center';

export class Args {
  private static registeredOptions: Map<string, ArgOption<any>> = new Map();
  private optionValues: Map<string, any> = new Map();

  static registerOption<T>(
    name: string,
    options?: {
      position?: number;
      parseArg?: (value: string) => T | Promise<T>;
      handler?: (
        value: T | undefined,
      ) => T | undefined | Promise<T | undefined>;
    },
  ): ArgOption<T>;
  static registerOption<T>(
    name: string,
    options: {
      position?: number;
      parseArg?: (value: string) => T | Promise<T>;
      handler?: (value: T) => T | Promise<T>;
      getDefault: () => T | Promise<T>;
    },
  ): ArgOptionRequired<T>;
  static registerOption<T>(
    name: string,
    options: {
      position?: number;
      parseArg?: (value: string) => T | Promise<T>;
      handler?: (
        value: T | undefined,
      ) => T | undefined | Promise<T | undefined>;
      getDefault?: () => T | Promise<T>;
    } = {},
  ): ArgOption<T> | ArgOptionRequired<T> {
    const option = {
      type:
        options.position === undefined
          ? ('string' as const)
          : ('positional' as const),
      name,
      ...options,
    };
    this.registeredOptions.set(name, option);
    return option;
  }

  static registerBoolOption(
    name: string,
    defaultValue: boolean | (() => boolean | Promise<boolean>),
  ): ArgOptionRequired<boolean> {
    const option = {
      type: 'boolean' as const,
      name,
      getDefault:
        typeof defaultValue === 'boolean' ? () => defaultValue : defaultValue,
    };
    this.registeredOptions.set(name, option);
    this.registeredOptions.set('no-' + name, option);
    return option;
  }

  static async parse(strArgs: string[]) {
    const self = new Args(strArgs);
    const args = [...strArgs];
    let position = 1;

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
              option.parseArg ? await option.parseArg(value) : value,
            );
            continue;
          }
        }
      }

      const positional = Array.from(this.registeredOptions.values()).find(
        (option) => option.position === position,
      );
      if (positional) {
        self.optionValues.set(
          positional.name,
          positional.parseArg ? await positional.parseArg(arg) : arg,
        );
      }
      position += 1;
    }

    // presets
    const preset = self.optionValues.get('preset') as string | undefined;
    if (preset) {
      const presets = await getPresets();
      if (preset in presets) {
        for (const [argName, argValue] of Object.entries(presets[preset])) {
          if (self.optionValues.has(argName)) {
            continue;
          }
          self.optionValues.set(argName, argValue);
        }
      } else {
        // tslint:disable-next-line: ban
        workspace.showMessage(`Preset(${preset}) not found`, 'warning');
      }
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
    let result: T;
    if (this.optionValues.has(option.name)) {
      result = this.optionValues.get(option.name);
    } else {
      if (!Args.registeredOptions.has(option.name)) {
        throw new Error(`Argument(${option.name}) not found`);
      } else {
        result = await Args.registeredOptions.get(option.name)?.getDefault?.();
      }
    }
    return Args.registeredOptions.get(option.name)?.handler?.(result) ?? result;
  }
}

export const argOptions = {
  rootUri: Args.registerOption('root-uri', {
    position: 1,
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
      return rootPath;
    },
    handler: (path: string) => normalizePath(path),
  }),
  toggle: Args.registerBoolOption('toggle', true),
  openActionStrategy: Args.registerOption<OpenStrategy>(
    'open-action-strategy',
    {
      getDefault: () => config.get<OpenStrategy>('openAction.strategy')!,
    },
  ),
  quitOnOpen: Args.registerBoolOption(
    'quit-on-open',
    () => config.get<boolean>('quitOnOpen')!,
  ),
  reveal: Args.registerOption<string>('reveal', {
    handler: (path) => (path ? normalizePath(path) : path),
  }),
  preset: Args.registerOption<string>('preset'),
  sources: Args.registerOption('sources', {
    parseArg: (sources) =>
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
    parseArg: (s) => parseInt(s, 10),
    getDefault: () => config.get<number>('width')!,
  }),
  contentWidth: Args.registerOption('content-width', {
    parseArg: (s) => parseInt(s, 10),
    getDefault: () => config.get<number>('contentWidth')!,
  }),
  contentWidthType: Args.registerOption('content-width-type', {
    getDefault: () => config.get<ArgContentWidthTypes>('contentWidthType')!,
  }),
  floatingPosition: Args.registerOption<
    ArgFloatingPositions | [number, number]
  >('floating-position', {
    parseArg: (s) => {
      if (['left-center', 'right-center', 'center'].includes(s)) {
        return s as ArgFloatingPositions;
      } else {
        return s.split(',').map((i) => parseInt(i, 10)) as [number, number];
      }
    },
    getDefault: () =>
      config.get<ArgFloatingPositions | [number, number]>('floating.position')!,
  }),
  floatingWidth: Args.registerOption('floating-width', {
    parseArg: (s) => parseInt(s, 10),
    getDefault: () => config.get<number>('floating.width')!,
  }),
  floatingHeight: Args.registerOption('floating-height', {
    parseArg: (s) => parseInt(s, 10),
    getDefault: () => config.get<number>('floating.height')!,
  }),
  floatingContentWidth: Args.registerOption('floating-content-width', {
    parseArg: (s) => parseInt(s, 10),
    getDefault: () => config.get<number>('floating.contentWidth')!,
  }),
  bufferRootTemplate: Args.registerOption<string>('buffer-root-template', {
    getDefault: () => config.get<string>('buffer.root.template')!,
  }),
  bufferChildTemplate: Args.registerOption<string>('buffer-child-template', {
    getDefault: () => config.get<string>('buffer.child.template')!,
  }),
  bufferChildLabelingTemplate: Args.registerOption<string>(
    'buffer-child-labeling-template',
    {
      getDefault: () => config.get<string>('buffer.child.labelingTemplate')!,
    },
  ),
  fileRootTemplate: Args.registerOption<string>('file-root-template', {
    getDefault: () => config.get<string>('file.root.template')!,
  }),
  fileRootLabelingTemplate: Args.registerOption<string>(
    'file-root-labeling-template',
    {
      getDefault: () => config.get<string>('file.root.labelingTemplate')!,
    },
  ),
  fileChildTemplate: Args.registerOption<string>('file-child-template', {
    getDefault: () => config.get<string>('file.child.template')!,
  }),
  fileChildLabelingTemplate: Args.registerOption<string>(
    'file-child-labeling-template',
    {
      getDefault: () => config.get<string>('file.child.labelingTemplate')!,
    },
  ),
};
