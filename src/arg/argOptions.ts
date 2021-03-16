import { normalizePath } from '../util';
import {
  Args,
  ArgsSource,
  ArgPosition,
  ArgContentWidthTypes,
  ArgFloatingPositions,
  ResolveArgValues,
  ParsedPosition,
} from './parseArgs';
import { OpenStrategy } from '../types';
import { config } from '../config';
import { Position } from '../types/pkg-config';

export const argOptions = {
  rootUri: Args.registerOption<string>('root-uri', {
    position: 1,
  }),
  toggle: Args.registerBoolOption(
    'toggle',
    () => config.get<boolean>('toggle')!,
  ),
  openActionStrategy: Args.registerOption<OpenStrategy>(
    'open-action-strategy',
    {
      getDefault: () => config.get<OpenStrategy>('openAction.strategy')!,
    },
  ),
  focus: Args.registerBoolOption('focus', () => config.get<boolean>('focus')!),
  quit: Args.registerBoolOption('quit', false),
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
  position: Args.registerOption<ParsedPosition, ArgPosition | ParsedPosition>(
    'position',
    {
      parseArg: (s) => {
        const [name, arg] = s.split(':') as [name: Position, arg: string];
        return { name, arg };
      },
      parsePreset: (pos) => {
        if (Array.isArray(pos)) {
          return { name: pos[0], arg: pos[0] };
        } else if (typeof pos === 'string') {
          return { name: pos };
        } else {
          return pos;
        }
      },
      getDefault: () => {
        const pos = config.get<ArgPosition>('position')!;
        if (Array.isArray(pos)) {
          return { name: pos[0], arg: pos[1] };
        } else {
          return { name: pos };
        }
      },
    },
  ),
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
      if (['left-center', 'right-center', 'center', 'center-top'].includes(s)) {
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
};

export type ResolvedArgs = ResolveArgValues<typeof argOptions>;
