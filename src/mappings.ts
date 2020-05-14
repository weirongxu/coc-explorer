import { config } from './config';
import { workspace } from 'coc.nvim';
import {
  OriginalMappings,
  ActionExp,
  OriginalActionExp,
  OriginalAction,
  Action,
} from './actions/mapping';

enum KeyMappingMode {
  none = 'none',
  default = 'default',
}

export const keyMappingMode = config.get<KeyMappingMode>(
  'keyMappingMode',
  KeyMappingMode.default,
);

const defaultMappingGroups: Record<
  keyof typeof KeyMappingMode,
  OriginalMappings
> = {
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
    gl: 'expand:recursive',
    gh: 'collapse:recursive',
    '<2-LeftMouse>': [
      'expandable?',
      ['expanded?', 'collapse', 'expand'],
      'open',
    ],
    o: ['expanded?', 'collapse', 'expand'],
    '<cr>': ['expandable?', 'cd', 'open'],
    e: 'open',
    s: 'open:split',
    E: 'open:vsplit',
    t: 'open:tab',
    '<bs>': 'gotoParent',
    gs: 'reveal:select',
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

    '[i': 'indentPrev',
    ']i': 'indentNext',

    '[m': 'modifiedPrev',
    ']m': 'modifiedNext',

    '[d': 'diagnosticPrev',
    ']d': 'diagnosticNext',

    '[c': 'gitPrev',
    ']c': 'gitNext',
    '<<': 'gitStage',
    '>>': 'gitUnstage',
  },
};

export type MappingMode = 'n' | 'v';

export type Mappings = Record<string, ActionExp>;

export async function getMappings(): Promise<Mappings> {
  const mappings: Mappings = {};
  const defaultMappings = defaultMappingGroups[keyMappingMode];
  if (workspace.isVim && !(await workspace.nvim.call('has', ['gui_running']))) {
    delete defaultMappings['<esc>'];
  }
  Object.entries({
    ...(defaultMappings || {}),
    ...config.get<OriginalMappings>('keyMappings', {}),
  }).forEach(([key, actionExp]) => {
    if (actionExp !== false) {
      mappings[key] = parseActionExp(actionExp);
    }
  });
  return mappings;
}

export function parseActionExp(
  originalActionExp: OriginalActionExp,
): ActionExp {
  if (Array.isArray(originalActionExp)) {
    return originalActionExp.map(parseActionExp);
  } else {
    return parseAction(originalActionExp);
  }
}

/**
 * @example
 * parseAction('open:split:plain')
 * // return { name: 'open', args: ['split', 'plain'] }
 */
export function parseAction(originalAction: OriginalAction): Action {
  if (typeof originalAction !== 'string') {
    return originalAction;
  }
  const [name, ...args] = originalAction.split(/:/);
  return {
    name,
    args,
  };
}

function singleAction(actionExp: ActionExp): Action | false {
  if (!Array.isArray(actionExp)) {
    return actionExp;
  } else if (actionExp.length === 1) {
    return singleAction(actionExp[0]);
  } else {
    return false;
  }
}

export async function getReverseMappings() {
  const mappings = await getMappings();
  const reverseMappings: Record<string, string> = {};
  Object.entries(mappings).find(([key, actionExp]) => {
    const action = singleAction(actionExp);
    if (action) {
      reverseMappings[action.name] = key;
    }
  });
  return reverseMappings;
}
