import { workspace } from 'coc.nvim';
import {
  Action,
  ActionExp,
  Mappings,
  OriginalAction,
  OriginalActionExp,
  OriginalMappings,
  OriginalUserMappings,
} from './actions/types';
import { config } from './config';

type MappingConfigMode = 'none' | 'default';

/**
 * @example
 * parseAction('open:split:plain')
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
    mappings[key] = parseOriginalActionExp(originalActionExp);
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
    } else {
      mappings[key] = parseOriginalActionExp(originalActionExp);
    }
  }
  return mappings;
}

export function getSingleAction(actionExp: ActionExp): Action | undefined {
  if (!Array.isArray(actionExp)) {
    return actionExp;
  } else if (actionExp.length === 1) {
    return getSingleAction(actionExp[0]);
  } else {
    return undefined;
  }
}

class KeyMapping {
  mode = config.get<MappingConfigMode>('keyMappingMode', 'default');

  configByModes: Record<
    MappingConfigMode,
    {
      global: OriginalMappings;
      sources: Record<string, OriginalMappings>;
    }
  > = {
    none: {
      global: {},
      sources: {},
    },
    default: {
      global: {
        '*': 'toggleSelection',
        '<tab>': 'actionMenu',

        gk: 'expandablePrev',
        gj: 'expandableNext',
        h: 'collapse',
        l: ['expandable?', 'expand', 'open'],
        J: ['toggleSelection', 'normal:j'],
        K: ['toggleSelection', 'normal:k'],
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
      sources: {},
    },
  };

  get config() {
    return this.configByModes[this.mode];
  }

  private globalMappings_?: Mappings;
  globalMappings() {
    if (!this.globalMappings_) {
      const deprecatedKeyMappings = config.get<OriginalUserMappings>(
        'keyMappings',
        {},
      );
      if (Object.keys(deprecatedKeyMappings).length > 2) {
        // eslint-disable-next-line no-restricted-properties
        workspace.showMessage(
          'explorer.keyMappings has been deprecated, please use explorer.keyMappings.global in coc-settings.json',
          'warning',
        );
      }
      this.globalMappings_ = mixAndParseMappings(this.config.global, {
        ...deprecatedKeyMappings,
        ...config.get<OriginalUserMappings>('keyMappings.global', {}),
      });
    }
    return this.globalMappings_;
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

  async getAllKeys() {
    let allKeys = Object.keys(this.globalMappings());
    for (const sourceMappings of Object.values(this.allSourceMappings())) {
      allKeys.push(...Object.keys(sourceMappings));
    }
    if (
      workspace.isVim &&
      !(await workspace.nvim.call('has', ['gui_running']))
    ) {
      allKeys = allKeys.filter((key) => key !== '<esc>');
    }
    return allKeys;
  }

  getActionExp(sourceType: string, key: string): ActionExp | undefined {
    const globalMappings = this.globalMappings();
    const sourceMappings = this.sourceMappings(sourceType);
    return sourceMappings?.[key] ?? globalMappings[key];
  }

  async getMappings(sourceType: string): Promise<Mappings> {
    const globalMappings = this.globalMappings();
    const sourceMappings = this.sourceMappings(sourceType);
    const mappings: Mappings = { ...globalMappings, ...sourceMappings };
    if (
      workspace.isVim &&
      !(await workspace.nvim.call('has', ['gui_running']))
    ) {
      delete mappings['<esc>'];
    }
    return mappings;
  }

  async getReversedMappings(sourceType: string) {
    const mappings = await this.getMappings(sourceType);
    const reverseMappings: Record<string, string> = {};
    Object.entries(mappings).find(([key, actionExp]) => {
      const action = getSingleAction(actionExp);
      if (action) {
        reverseMappings[action.name] = key;
      }
    });
    return reverseMappings;
  }
}

export const keyMapping = new KeyMapping();
