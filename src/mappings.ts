import { config } from './util';

enum MappingMode {
  none = 'none',
  default = 'default',
}

export const mappingMode = config.get<MappingMode>('keyMappingMode', MappingMode.default);

const Actions = {
  select: 0,
  unselect: 0,
  toggleSelection: 0,
  actionMenu: 0,

  shrink: 0,
  expand: 0,
  expandRecursive: 0,
  shrinkRecursive: 0,
  expandOrShrink: 0,
  cd: 0,
  open: 0,
  openInSplit: 0,
  openInVsplit: 0,
  openInTab: 0,
  drop: 0,
  gotoParent: 0,

  copyFilepath: 0,
  copyFilename: 0,
  copyFile: 0,
  cutFile: 0,
  pasteFile: 0,
  delete: 0,
  deleteForever: 0,

  addFile: 0,
  addDirectory: 0,
  rename: 0,

  toggleHidden: 0,
  refresh: 0,
  normal: 1,

  help: 0,
  quit: 0,
  systemExecute: 0,
  windowsDrive: 0,

  diagnosisPrev: 0,
  diagnosisNext: 0,

  gitPrev: 0,
  gitNext: 0,
  gitStage: 0,
  gitUnstage: 0,
};

export type ActionSyms = keyof typeof Actions;

export const ActionSyms = Object.keys(Actions) as ActionSyms[];

type OriginalMappings = Record<string, false | string | string[]>;

export const defaultMappings: Record<keyof typeof MappingMode, OriginalMappings> = {
  none: {},
  default: {
    '*': 'toggleSelection',
    '<tab>': 'actionMenu',

    h: 'shrink',
    l: 'expand',
    J: ['toggleSelection', 'normal:j'],
    K: ['toggleSelection', 'normal:k'],
    gl: 'expandRecursive',
    gh: 'shrinkRecursive',
    o: 'expandOrShrink',
    '<cr>': 'open',
    e: 'open',
    E: 'openInVsplit',
    t: 'openInTab',
    '<bs>': 'gotoParent',

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
    gd: 'windowsDrive',

    '[d': 'diagnosisPrev',
    ']d': 'diagnosisNext',

    '[c': 'gitPrev',
    ']c': 'gitNext',
    'g<': 'gitStage',
    'g>': 'gitUnstage',
  },
};

export type Action = {
  name: ActionSyms;
  arg: string;
};

type Mappings = Record<string, Action[]>;

export const mappings: Mappings = {};

function parseAction(originalAction: string): Action {
  const [name, arg] = originalAction.split(/:(.+)/, 2) as [ActionSyms, string];
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
    mappings[key] = Array.isArray(actions) ? actions.map((action) => parseAction(action)) : [parseAction(actions)];
  }
});

export const reverseMappings: Record<string, string> = {};

Object.entries(mappings).find(([key, actions]) => {
  if (actions.length === 1) {
    reverseMappings[actions[0].name] = key;
  }
});
