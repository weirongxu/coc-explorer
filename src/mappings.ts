import { workspace } from 'coc.nvim';
import { conditionActionRules, waitAction } from './actions/special';
import {
  Action,
  ActionExp,
  MappingMode,
  Mappings,
  OriginalAction,
  OriginalActionExp,
  OriginalMappings,
  OriginalUserMappings,
} from './actions/types';
import { config } from './config';
import { Explorer } from './types/pkg-config';

type MappingConfigMode = 'none' | 'default';

/**
 * @example
 * parseOriginalAction('open:split:plain')
 * // return { name: 'open', args: ['split', 'plain'] }
 */
export function parseOriginalAction(originalAction: OriginalAction): Action {
  if (typeof originalAction !== 'string') {
    return originalAction;
  }
  const [name, ...args] = originalAction.split(/:/);
  return {
    name,
    args,
  };
}

/**
 * @example
 * parseAction('open:split:plain')
 * // return { name: 'open', args: ['split', 'plain'] }
 */
export function toOriginalAction(action: Action): string {
  const { name, args } = action;
  return [name, ...args].join(':');
}

export function parseMappingKey(key: string) {
  return key.includes('<dot>') ? key.replace(/\<dot\>/g, '.') : key;
}

export function parseOriginalActionExp(
  originalActionExp: OriginalActionExp,
): ActionExp {
  if (Array.isArray(originalActionExp)) {
    return originalActionExp.map(parseOriginalActionExp);
  } else {
    return parseOriginalAction(originalActionExp);
  }
}

export function parseOriginalMappings(originalMappings: OriginalMappings) {
  const mappings: Mappings = {};
  for (const [key, originalActionExp] of Object.entries(originalMappings)) {
    mappings[parseMappingKey(key)] = parseOriginalActionExp(originalActionExp);
  }
  return mappings;
}

function mixAndParseMappings(
  defaultMappings: OriginalMappings,
  userMappings: OriginalUserMappings,
) {
  const mappings = parseOriginalMappings(defaultMappings);
  for (const [key, originalActionExp] of Object.entries(userMappings)) {
    if (originalActionExp === false) {
      delete mappings[key];
      continue;
    }
    mappings[parseMappingKey(key)] = parseOriginalActionExp(originalActionExp);
  }
  return mappings;
}

export function getSingleAction(actionExp: ActionExp): Action | undefined {
  if (!Array.isArray(actionExp)) {
    return actionExp;
  } else {
    const actions = actionExp
      .map((action) => getSingleAction(action))
      .filter(
        (action) =>
          action &&
          !(action.name in conditionActionRules) &&
          action.name !== waitAction.name,
      );
    return actions[0];
  }
}

type MouseMode = NonNullable<Explorer['explorer.mouseMode']>;

class KeyMapping {
  mode = config.get<MappingConfigMode>('keyMappingMode', 'default');

  private readonly mouseMappings = ({
    none: {},
    singleclick: {
      '<LeftRelease>': [
        'expandable?',
        ['expanded?', 'collapse', 'expand'],
        'open',
      ],
    },
    doubleclick: {
      '<2-LeftMouse>': [
        'expandable?',
        ['expanded?', 'collapse', 'expand'],
        'open',
      ],
    },
  } as Record<MouseMode, OriginalMappings>)[
    config.get<MouseMode>('mouseMode')!
  ];

  readonly configByModes: Record<
    MappingConfigMode,
    {
      global: OriginalMappings;
      vmap: OriginalMappings;
      sources: Record<string, OriginalMappings>;
    }
  > = {
    none: {
      global: {},
      vmap: {},
      sources: {},
    },
    default: {
      global: {
        '*': 'toggleSelection',
        '<tab>': 'actionMenu',

        h: ['wait', 'collapse'],
        l: ['wait', 'expandable?', 'expand', 'open'],
        J: ['wait', 'toggleSelection', 'normal:j'],
        K: ['wait', 'toggleSelection', 'normal:k'],
        gl: ['wait', 'expand:recursive'],
        gh: ['wait', 'collapse:recursive'],
        ...this.mouseMappings,
        o: ['wait', 'expanded?', 'collapse', 'expand'],
        '<cr>': ['wait', 'expandable?', 'cd', 'open'],
        e: 'open',
        s: 'open:split',
        E: 'open:vsplit',
        t: 'open:tab',
        '<bs>': ['wait', 'gotoParent'],
        gs: ['wait', 'reveal:select'],

        il: 'preview:labeling',
        ic: 'preview:content',
        Il: 'previewOnHover:toggle:labeling',
        Ic: 'previewOnHover:toggle:content',
        II: 'previewOnHover:disable',

        yp: 'copyFilepath',
        yn: 'copyFilename',
        yy: 'copyFile',
        yY: 'copyFile:replace',
        dd: 'cutFile',
        dD: 'cutFile:replace',
        p: 'pasteFile',
        df: 'delete',
        dF: 'deleteForever',

        a: 'addFile',
        A: 'addDirectory',
        r: 'rename',

        zh: 'toggleHidden',
        'g<dot>': 'toggleHidden',
        R: 'refresh',

        '?': 'help',
        q: 'quit',
        '<esc>': 'esc',
        X: 'systemExecute',
        gd: 'listDrive',

        f: 'search',
        F: 'search:recursive',

        gf: 'gotoSource:file',
        gb: 'gotoSource:buffer',

        '[[': ['wait', 'sourcePrev'],
        ']]': ['wait', 'sourceNext'],

        '[i': ['wait', 'indentPrev'],
        ']i': ['wait', 'indentNext'],

        '[m': ['wait', 'markPrev:modified'],
        ']m': ['wait', 'markNext:modified'],

        '[d': ['wait', 'markPrev:diagnosticError:diagnosticWarning'],
        ']d': ['wait', 'markNext:diagnosticError:diagnosticWarning'],
        '[D': ['wait', 'markPrev:diagnosticError'],
        ']D': ['wait', 'markNext:diagnosticError'],

        '[c': ['wait', 'markPrev:gitUnstaged:gitStaged'],
        ']c': ['wait', 'markNext:gitUnstaged:gitStaged'],
        '[C': ['wait', 'markPrev:gitUnstaged'],
        ']C': ['wait', 'markNext:gitUnstaged'],
        '<<': 'gitStage',
        '>>': 'gitUnstage',
      },
      vmap: {
        il: 'textobj:line:i',
        al: 'textobj:line:a',
        ii: 'textobj:indent:i',
        ai: 'textobj:indent:a',
      },
      sources: {},
    },
  };

  get config() {
    return this.configByModes[this.mode];
  }

  private globalMappings_?: Mappings;
  globalMappings() {
    if (!this.globalMappings_) {
      this.globalMappings_ = mixAndParseMappings(this.config.global, {
        ...config.get<OriginalUserMappings>('keyMappings.global', {}),
      });
    }
    return this.globalMappings_;
  }

  private vmapMappings_?: Mappings;
  vmapMappings() {
    if (!this.vmapMappings_) {
      this.vmapMappings_ = mixAndParseMappings(this.config.vmap, {
        ...config.get<OriginalUserMappings>('keyMappings.vmap', {}),
      });
    }
    return this.vmapMappings_;
  }

  private allSourceMappings_?: Record<string, Mappings>;
  allSourceMappings() {
    if (!this.allSourceMappings_) {
      const defaultSources = this.config.sources ?? {};
      const userSources = config.get<Record<string, OriginalUserMappings>>(
        'keyMappings.sources',
        {},
      );
      this.allSourceMappings_ = {};
      for (const [type, sourceMappings] of Object.entries(defaultSources)) {
        this.allSourceMappings_[type] = {
          ...parseOriginalMappings(sourceMappings),
        };
      }
      for (const [type, sourceMappings] of Object.entries(userSources)) {
        if (type in this.allSourceMappings_) {
          this.allSourceMappings_[type] = mixAndParseMappings(
            this.allSourceMappings_[type],
            sourceMappings,
          );
        } else {
          this.allSourceMappings_[type] = mixAndParseMappings(
            {},
            sourceMappings,
          );
        }
      }
    }
    return this.allSourceMappings_;
  }

  sourceMappings(sourceType: string): Mappings | undefined {
    return this.allSourceMappings()[sourceType];
  }

  private async filterEscForVim(keys: Set<string>) {
    if (
      workspace.isVim &&
      !(await workspace.nvim.call('has', ['gui_running']))
    ) {
      keys.delete('<esc>');
    }
  }

  async getCommonKeys() {
    const keys = new Set<string>();
    for (const key of Object.keys(this.globalMappings())) {
      keys.add(key);
    }
    for (const sourceMappings of Object.values(this.allSourceMappings())) {
      for (const key of Object.keys(sourceMappings)) {
        keys.add(key);
      }
    }
    await this.filterEscForVim(keys);
    return keys;
  }

  async getVisualKeys() {
    const keys = new Set<string>();
    for (const key of Object.keys(this.vmapMappings())) {
      keys.add(key);
    }
    // await this.filterEscForVim(keys);
    return keys;
  }

  getActionExp(
    sourceType: string,
    key: string,
    mode: MappingMode,
  ): ActionExp | undefined {
    const vmapMappings = this.vmapMappings();
    const globalMappings = this.globalMappings();
    const sourceMappings = this.sourceMappings(sourceType);
    if (mode === 'v') {
      return (
        vmapMappings?.[key] ?? sourceMappings?.[key] ?? globalMappings[key]
      );
    }
    return sourceMappings?.[key] ?? globalMappings[key];
  }

  async getMappings(
    sourceType: string,
  ): Promise<{
    all: Mappings;
    vmap: Mappings;
  }> {
    const globalMappings = this.globalMappings();
    const vmapMappings = this.vmapMappings();
    const sourceMappings = this.sourceMappings(sourceType);
    const mappings: Mappings = { ...globalMappings, ...sourceMappings };
    if (
      workspace.isVim &&
      !(await workspace.nvim.call('has', ['gui_running']))
    ) {
      delete mappings['<esc>'];
    }
    return {
      all: mappings,
      vmap: vmapMappings,
    };
  }

  async getReversedMappings(sourceType: string) {
    const mappings = await this.getMappings(sourceType);
    const reverseMappings: Record<string, { all?: string; vmap?: string }> = {};
    Object.entries(mappings.all).find(([key, actionExp]) => {
      const action = getSingleAction(actionExp);
      if (action) {
        const orgAction = toOriginalAction(action);
        if (!reverseMappings[orgAction]) {
          reverseMappings[orgAction] = {};
        }
        reverseMappings[orgAction].all = key;
      }
    });
    Object.entries(mappings.vmap).find(([key, actionExp]) => {
      const action = getSingleAction(actionExp);
      if (action) {
        const orgAction = toOriginalAction(action);
        if (!reverseMappings[orgAction]) {
          reverseMappings[orgAction] = {};
        }
        reverseMappings[orgAction].vmap = key;
      }
    });
    return reverseMappings;
  }
}

export const keyMapping = new KeyMapping();
