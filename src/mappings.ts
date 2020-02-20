import { config } from './util';

enum MappingMode {
  none = 'none',
  default = 'default',
}

export const mappingMode = config.get<MappingMode>('keyMappingMode', MappingMode.default);

type OriginalMappings = Record<string, false | string | string[]>;

export const defaultMappings: Record<keyof typeof MappingMode, OriginalMappings> = {
  none: {},
  default: {
    '*': 'toggleSelection',
    '<tab>': 'actionMenu',

    k: 'nodePrev',
    j: 'nodeNext',
    h: 'collapse',
    l: ['expandable?', 'expand', 'open'],
    J: ['toggleSelection', 'nodeNext'],
    K: ['toggleSelection', 'nodePrev'],
    gl: 'expandRecursive',
    gh: 'collapseRecursive',
    o: 'expandOrCollapse',
    '<cr>': 'open',
    e: 'open',
    s: 'open:split',
    E: 'open:vsplit',
    t: 'open:tab',
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
    '<esc>': 'esc',
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
  name: string;
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
  const [name, arg] = originalAction.split(/:(.+)/, 2) as [string, string | undefined];
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
