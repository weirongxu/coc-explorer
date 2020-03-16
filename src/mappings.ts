import { config } from './util';
import { workspace } from 'coc.nvim';

enum MappingMode {
  none = 'none',
  default = 'default',
}

export const mappingMode = config.get<MappingMode>('keyMappingMode', MappingMode.default);

type OriginalMappings = Record<string, false | string | string[]>;

const defaultMappingGroups: Record<keyof typeof MappingMode, OriginalMappings> = {
  none: {},
  default: {
    '*': 'toggleSelection',
    '<tab>': 'actionMenu',

    k: 'nodePrev',
    j: 'nodeNext',
    gk: 'expandablePrev',
    gj: 'expandableNext',
    h: 'collapse',
    l: ['expandable?', 'expand', 'open'],
    J: ['toggleSelection', 'nodeNext'],
    K: ['toggleSelection', 'nodePrev'],
    gl: 'expandRecursive',
    gh: 'collapseRecursive',
    '<2-LeftMouse>': ['expandable?', 'expandOrCollapse', 'open'],
    o: 'expandOrCollapse',
    '<cr>': ['expandable?', 'cd', 'open'],
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
  args: string[];
};

export type ActionMode = 'n' | 'v';

type Mappings = Record<string, Action[]>;

export async function getMappings(): Promise<Mappings> {
  const mappings: Mappings = {};
  const defaultMappings = defaultMappingGroups[mappingMode];
  if (workspace.isVim && !(await workspace.nvim.call('has', ['gui_running']))) {
    delete defaultMappings['<esc>'];
  }
  Object.entries({
    ...(defaultMappings || {}),
    ...config.get<OriginalMappings>('keyMappings', {}),
  }).forEach(([key, actions]) => {
    if (actions) {
      mappings[key] = Array.isArray(actions)
        ? actions.map((action) => parseAction(action))
        : [parseAction(actions)];
    }
  });
  return mappings;
}

/**
 * @example
 * parseAction('open:split:plain')
 * // return { name: 'open', args: ['split', 'plain'] }
 */
function parseAction(originalAction: string): Action {
  const [name, ...args] = originalAction.split(/:(.+)/, 2);
  return {
    name,
    args,
  };
}

export async function getReverseMappings() {
  const mappings = getMappings();
  const reverseMappings: Record<string, string> = {};
  Object.entries(mappings).find(([key, actions]) => {
    if (actions.length === 1) {
      reverseMappings[actions[0].name] = key;
    }
  });
  return reverseMappings;
}
