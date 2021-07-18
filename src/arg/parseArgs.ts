import { window, WorkspaceConfiguration } from 'coc.nvim';
import { getPresets } from '../presets';
import { Explorer, Position } from '../types/pkg-config';
import { splitCount } from '../util';

export interface ArgsSource {
  name: string;
  expand: boolean;
}

export type ArgPosition = NonNullable<Explorer['explorer.position']>;

export type ParsedPosition = {
  name: Position;
  arg?: string;
};

export type OptionType = 'boolean' | 'string' | 'positional';

export type ArgOption<T, P> = {
  type: OptionType;
  name: string;
  position?: number;
  parseArg?: (value: string) => Promise<T> | T;
  parsePreset?: (value: P) => Promise<T> | T;
  handler?: (value: T | undefined) => Promise<T | undefined> | T | undefined;
  getDefault?: () => Promise<T> | T;
  description?: string;
};

export type ArgOptionRequired<T, P> = {
  type: OptionType;
  name: string;
  position?: number;
  parseArg?: (value: string) => Promise<T> | T;
  parsePreset?: (value: P) => Promise<T> | T;
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

export type ResolveArgValue<T> = T extends ArgOptionRequired<infer V, any>
  ? V
  : T extends ArgOption<infer V, any>
  ? V | undefined
  : never;

export type ResolveArgValues<T> = {
  [K in keyof T]: ResolveArgValue<T[K]>;
};

export class Args {
  private static registeredOptions: Map<
    string,
    ArgOption<any, any>
  > = new Map();
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
  ): ArgOption<T, unknown>;
  static registerOption<T, P>(
    name: string,
    options?: {
      position?: number;
      parseArg?: (value: string) => T | Promise<T>;
      parsePreset: (value: P) => T | Promise<T>;
      handler?: (
        value: T | undefined,
      ) => T | undefined | Promise<T | undefined>;
    },
  ): ArgOption<T, P>;
  static registerOption<T>(
    name: string,
    options: {
      position?: number;
      parseArg?: (value: string) => T | Promise<T>;
      handler?: (value: T) => T | Promise<T>;
      getDefault: () => T | Promise<T>;
    },
  ): ArgOptionRequired<T, unknown>;
  static registerOption<T, P>(
    name: string,
    options: {
      position?: number;
      parseArg?: (value: string) => T | Promise<T>;
      parsePreset: (value: P) => T | Promise<T>;
      handler?: (value: T) => T | Promise<T>;
      getDefault: () => T | Promise<T>;
    },
  ): ArgOptionRequired<T, P>;
  static registerOption<T, P>(
    name: string,
    options: {
      position?: number;
      parsePreset?: (value: P) => T | Promise<T>;
      parseArg?: (value: string) => T | Promise<T>;
      handler?: (
        value: T | undefined,
      ) => T | undefined | Promise<T | undefined>;
      getDefault?: () => T | Promise<T>;
    } = {},
  ): ArgOption<T, P> | ArgOptionRequired<T, P> {
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
  ): ArgOptionRequired<boolean, boolean> {
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
    const presetName = self.optionValues.get('preset') as string | undefined;
    if (!presetName) {
      return self;
    }

    const presets = await getPresets(config);
    const preset = presets.get(presetName);
    if (!preset) {
      // eslint-disable-next-line no-restricted-properties
      window.showMessage(
        `coc-explorer preset(${presetName}) not found`,
        'warning',
      );
      return self;
    }

    for (const [argName, argValue] of preset) {
      if (self.optionValues.has(argName) || argValue === undefined) {
        continue;
      }
      const option = this.registeredOptions.get(argName);
      if (option) {
        self.optionValues.set(
          argName,
          option.parsePreset?.(argValue) ?? argValue,
        );
      }
    }

    return self;
  }

  constructor(public readonly args: string[]) {}

  has(option: ArgOption<any, any>): boolean {
    return this.optionValues.has(option.name);
  }

  async value<T, P>(option: ArgOptionRequired<T, P>): Promise<T>;
  async value<T, P>(option: ArgOption<T, P>): Promise<T | undefined>;
  async value<T, P>(option: ArgOption<T, P>): Promise<T | undefined> {
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

  async values<
    T extends Record<string, ArgOptionRequired<any, any> | ArgOption<any, any>>
  >(options: T): Promise<ResolveArgValues<T>> {
    const entries = await Promise.all(
      Object.entries(options).map(
        async ([key, option]) => [key, await this.value(option)] as const,
      ),
    );
    return entries.reduce((ret, [key, value]) => {
      ret[key as keyof T] = value;
      return ret;
    }, {} as ResolveArgValues<T>);
  }
}
