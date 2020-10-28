import { normalizePath } from './util';
import {
  Args,
  ArgsSource,
  ArgPosition,
  ArgContentWidthTypes,
  ArgFloatingPositions,
} from './parseArgs';
import { OpenStrategy } from './types/types';
import { config } from './config';

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
  bookmarkRootTemplate: Args.registerOption<string>('bookmark-root-template', {
    getDefault: () => config.get<string>('bookmark.root.template')!,
  }),
  bookmarkChildTemplate: Args.registerOption<string>(
    'bookmark-child-template',
    {
      getDefault: () => config.get<string>('bookmark.child.template')!,
    },
  ),
  bookmarkChildLabelingTemplate: Args.registerOption<string>(
    'bookmark-child-labeling-template',
    {
      getDefault: () => config.get<string>('bookmark.child.labelingTemplate')!,
    },
  ),
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
