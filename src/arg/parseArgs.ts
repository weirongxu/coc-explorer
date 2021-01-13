import { window, WorkspaceConfiguration } from 'coc.nvim';
import { getPresets } from '../presets';
import { splitCount } from '../util';

export interface ArgsSource {
  name: string;
  expand: boolean;
}

export type ArgPosition = 'tab' | 'left' | 'right' | 'floating';

export type OptionType = 'boolean' | 'string' | 'positional';

export type ArgOption<T> = {
  type: OptionType;
  name: string;
  position?: number;
  parseArg?: (value: string) => Promise<T> | T;
  handler?: (value: T | undefined) => Promise<T | undefined> | T | undefined;
  getDefault?: () => Promise<T> | T;
  description?: string;
};

export type ArgOptionRequired<T> = {
  type: OptionType;
  name: string;
  position?: number;
  parseArg?: (value: string) => Promise<T> | T;
  handler?: (value: T) => Promise<T> | T;
  getDefault: () => Promise<T> | T;
  description?: string;
};

export type ArgContentWidthTypes = 'win-width' | 'vim-width';

export type ArgFloatingPositions =
  | 'left-center'
  | 'right-center'
  | 'center'
  | 'center-top';

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

  static async parse(strArgs: string[], config: WorkspaceConfiguration) {
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

        if (!option) {
          throw Error(`coc-explorer command no support option(${key})`);
        }

        if (value === undefined) {
          if (option.type === 'boolean') {
            self.optionValues.set(option.name, !key.startsWith('no-'));
            continue;
          } else {
            value = args.shift()!;
            if (value === undefined) {
              continue;
            }
          }
        }

        self.optionValues.set(
          option.name,
          option.parseArg ? await option.parseArg(value) : value,
        );
        continue;
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
    if (!preset) {
      return self;
    }

    const presets = await getPresets(config);
    if (!(preset in presets)) {
      // eslint-disable-next-line no-restricted-properties
      window.showMessage(`coc-explorer preset(${preset}) not found`, 'warning');
      return self;
    }

    for (const [argName, argValue] of Object.entries(presets[preset])) {
      if (self.optionValues.has(argName) || argValue === undefined) {
        continue;
      }
      const option = this.registeredOptions.get(argName);
      if (option) {
        self.optionValues.set(
          argName,
          argValue,
          // option.parseArg ? option.parseArg(argValue) : argValue,
        );
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
