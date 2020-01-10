import { config } from './util';

enum MappingMode {
  none = 'none',
  default = 'default',
}

export const mappingMode = config.get<MappingMode>('keyMappingMode', MappingMode.default);

export const actionSyms = [
  'select',
  'unselect',
  'toggleSelection',
  'actionMenu',

  'collapse',
  'expand',
  'expandRecursive',
  'collapseRecursive',
  'expandOrCollapse',
  'cd',
  'open',
  'openInSplit',
  'openInVsplit',
  'openInTab',
  'drop',
  'gotoParent',
  'preview',

  'copyFilepath',
  'copyFilename',
  'copyFile',
  'cutFile',
  'pasteFile',
  'delete',
  'deleteForever',

  'addFile',
  'addDirectory',
  'rename',

  'toggleHidden',
  'refresh',
  'normal',

  'help',
  'quit',
  'systemExecute',
  'listDrive',

  'search',
  'searchRecursive',

  'nodePrev',
  'nodeNext',

  'gotoSource',
  'sourcePrev',
  'sourceNext',

  'diagnosticPrev',
  'diagnosticNext',

  'gitPrev',
  'gitNext',
  'gitStage',
  'gitUnstage',
] as const;

export type ActionSyms = typeof actionSyms[number];

type OriginalMappings = Record<string, false | string | string[]>;

export const defaultMappings: Record<keyof typeof MappingMode, OriginalMappings> = {
  none: {},
  default: {
    k: 'nodePrev',
    j: 'nodeNext',

    '*': 'toggleSelection',
    '<tab>': 'actionMenu',

    h: 'collapse',
    l: 'expand',
    J: ['toggleSelection', 'nodeNext'],
    K: ['toggleSelection', 'nodePrev'],
    gl: 'expandRecursive',
    gh: 'collapseRecursive',
    o: 'expandOrCollapse',
    '<cr>': 'open',
    e: 'open',
    E: 'openInVsplit',
    t: 'openInTab',
    '<bs>': 'gotoParent',
    gp: 'preview:labeling',

    y: 'copyFilepath',
    Y: 'copyFilename',
    c: 'copyFile',
    x: 'cutFile',
    p: 'pasteFile',
    d: 'delete',
    D: 'deleteForever',

    a: 'addFile',
    A: 'addDirectory',
    r: 'rename',

    '.': 'toggleHidden',
    R: 'refresh',

    '?': 'help',
    q: 'quit',
    X: 'systemExecute',
    gd: 'listDrive',

    f: 'search',
    F: 'searchRecursive',

    gf: 'gotoSource:file',
    gb: 'gotoSource:buffer',

    '[[': 'sourcePrev',
    ']]': 'sourceNext',

    '[d': 'diagnosticPrev',
    ']d': 'diagnosticNext',

    '[c': 'gitPrev',
    ']c': 'gitNext',
    '<<': 'gitStage',
    '>>': 'gitUnstage',
  },
};

export type Action = {
  name: ActionSyms;
  arg?: string;
};

export type ActionMode = 'n' | 'v';

type Mappings = Record<string, Action[]>;

export const mappings: Mappings = {};

/**
 * @example
 * parseAction('normal:j')
 * // return { name: 'normal', arg: 'j' }
 */
function parseAction(originalAction: string): Action {
  const [name, arg] = originalAction.split(/:(.+)/, 2) as [ActionSyms, string | undefined];
  return {
    name,
    arg,
  };
}

Object.entries({
  ...(defaultMappings[mappingMode] || {}),
  ...config.get<OriginalMappings>('keyMappings', {}),
}).forEach(([key, actions]) => {
  if (actions) {
    mappings[key] = Array.isArray(actions)
      ? actions.map((action) => parseAction(action))
      : [parseAction(actions)];
  }
});

export const reverseMappings: Record<string, string> = {};

Object.entries(mappings).find(([key, actions]) => {
  if (actions.length === 1) {
    reverseMappings[actions[0].name] = key;
  }
});
