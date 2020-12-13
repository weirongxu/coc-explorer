import { Disposable, workspace, disposeAll } from 'coc.nvim';
import { conditionActionRules, waitAction } from './actions/special';
import { Explorer } from './explorer';
import { keyMapping } from './mappings';
import { hlGroupManager } from './highlight/manager';
import { BaseTreeNode, ExplorerSource } from './source/source';
import { ViewPainter, ViewRowPainter } from './source/viewPainter';
import { Action, ActionExp } from './actions/types';
import { ActionRegistrar } from './actions/registrar';
import { ActionMenu } from './actions/menu';
import {
  HighlightPosition,
  HighlightPositionWithLine,
} from './highlight/types';
import { DrawBlock } from './painter/types';
import { Notifier } from 'coc-helper';

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);
const helpHightlights = {
  line: hl('HelpLine', 'Operator'),
  hint: hl('HelpHint', 'Comment'),
  title: hl('HelpTitle', 'Boolean'),
  subtitle: hl('HelpSubTitle', 'Label'),
  mappingKey: hl('HelpMappingKey', 'PreProc'),
  action: hl('HelpAction', 'Identifier'),
  column: hl('HelpColumn', 'Identifier'),
  arg: hl('HelpArg', 'Identifier'),
  description: hl('HelpDescription', 'Comment'),
  type: hl('HelperType', 'Type'),
  conditional: hl('HelpConditional', 'Conditional'),
};

interface MappingActionContext {
  key: string;
  isFirstLine: boolean;
  isWait: boolean;
}

export class HelpPainter {
  painter: ViewPainter;
  drawnResults: {
    highlightPositions: HighlightPosition[];
    content: string;
  }[] = [];
  registeredActions: ActionRegistrar.Map<BaseTreeNode<any>>;

  constructor(
    private explorer: Explorer,
    private source: ExplorerSource<any>,
    private width: number,
  ) {
    this.painter = new ViewPainter(explorer);

    this.registeredActions = this.source.action.registeredActions();
  }

  async drawRow(drawBlock: DrawBlock) {
    const row = await this.painter.drawRow(drawBlock);
    this.drawnResults.push(await row.draw());
  }

  async drawHr() {
    await this.drawRow((row) => {
      row.add('—'.repeat(this.width), { hl: helpHightlights.line });
    });
  }

  async drawHead() {
    await this.drawRow((row) => {
      row.add('Help ');
      row.add('(use q, ? or <esc> return to explorer)', {
        hl: helpHightlights.hint,
      });
    });
    await this.drawHr();
  }

  drawActionForMapping(row: ViewRowPainter, action: Action) {
    row.add(action.name, { hl: helpHightlights.action });
    if (action.args) {
      row.add(`(${action.args.join(',')})`, { hl: helpHightlights.arg });
    }
    row.add(' ');
    if (action.name in this.registeredActions) {
      row.add(this.registeredActions[action.name].description, {
        hl: helpHightlights.description,
      });
    }
  }

  private anyAction(
    actionExp: ActionExp,
    callback: (action: Action) => boolean,
  ): boolean {
    if (Array.isArray(actionExp)) {
      return actionExp.some((action) => this.anyAction(action, callback));
    } else {
      return callback(actionExp);
    }
  }

  private drawMappingsPrefix(
    indent: string,
    row: ViewRowPainter,
    ctx: MappingActionContext,
  ) {
    if (!ctx.isFirstLine) {
      row.add(indent);
      return;
    }
    ctx.isFirstLine = false;
    if (ctx.key) {
      row.add(' ');
      row.add(ctx.key, { hl: helpHightlights.mappingKey });
      row.add(' - ');
    }
    if (ctx.isWait) {
      row.add(waitAction.helpDescription, { hl: helpHightlights.type });
    }
  }

  private async drawMappingsAction(
    indent: string,
    action: Action,
    ctx: MappingActionContext,
  ) {
    await this.drawRow((row) => {
      this.drawMappingsPrefix(indent, row, ctx);

      row.add(action.name, { hl: helpHightlights.action });
      if (action.args) {
        row.add(`(${action.args.join(',')})`, { hl: helpHightlights.arg });
      }
      row.add(' ');
      if (action.name in this.registeredActions) {
        row.add(this.registeredActions[action.name].description, {
          hl: helpHightlights.description,
        });
      }
    });
  }

  private async drawMappingsActionExp(
    indent: string,
    actionExp: ActionExp,
    ctx: MappingActionContext,
  ) {
    if (Array.isArray(actionExp)) {
      for (let i = 0; i < actionExp.length; i++) {
        const action = actionExp[i];

        if (Array.isArray(action)) {
          await this.drawMappingsActionExp(indent, action, ctx);
          continue;
        }

        if (action.name === waitAction.name) {
          if (ctx.isFirstLine) {
            ctx.isWait = true;
          }
          continue;
        }

        const rule = conditionActionRules[action.name];
        if (rule) {
          await this.drawRow((row) => {
            this.drawMappingsPrefix(indent, row, ctx);
            row.add('if ' + rule.getHelpDescription(action.args), {
              hl: helpHightlights.conditional,
            });
          });
          const [trueAction, falseAction] = [
            actionExp[i + 1],
            actionExp[i + 2],
          ];
          await this.drawMappingsActionExp(indent + '  ', trueAction, ctx);
          await this.drawRow((row) => {
            row.add(indent);
            row.add('else', {
              hl: helpHightlights.conditional,
            });
          });
          await this.drawMappingsActionExp(indent + '  ', falseAction, ctx);
          i += 2;
          continue;
        }

        await this.drawMappingsAction(indent, action, ctx);
      }
    } else {
      await this.drawMappingsAction(indent, actionExp, ctx);
    }
  }

  /**
   * <cr> - <wait> if expandable?
   *          if expanded?
   *            expand() expand a directory
   *          else
   *            collapse() collapse a directory
   *        else
   *          open() open file or directory
   */
  async drawMappings() {
    await this.drawRow((row) => {
      row.add(`Mappings for source(${this.source.sourceType})`, {
        hl: helpHightlights.title,
      });
    });

    const mappings = await keyMapping.getMappings(this.source.sourceType);
    for (const [key, actionExp] of Object.entries(mappings)) {
      if (
        !this.anyAction(
          actionExp,
          (action) => action.name in this.registeredActions,
        )
      ) {
        continue;
      }

      await this.drawMappingsActionExp(' '.repeat(key.length + 4), actionExp, {
        key,
        isFirstLine: true,
        isWait: false,
      });
    }
  }

  async drawActions() {
    await this.drawRow((row) => {
      row.add(`Actions for source(${this.source.sourceType})`, {
        hl: helpHightlights.title,
      });
    });

    for (const [name, action] of Object.entries(this.registeredActions)) {
      await this.drawRow((row) => {
        row.add(' ');
        row.add(name, { hl: helpHightlights.action });
        row.add(' ');
        row.add(action.description, { hl: helpHightlights.description });
      });

      // draw args
      if (action.options.args) {
        await this.drawRow((row) => {
          row.add('   ');
          row.add('args:', { hl: helpHightlights.subtitle });
        });
        for (const arg of action.options.args) {
          await this.drawRow((row) => {
            row.add('     - ');
            row.add(arg.name, { hl: helpHightlights.arg });
            if (arg.description) {
              row.add(' ');
              row.add(arg.description, { hl: helpHightlights.description });
            }
          });
        }
      }

      // draw menus
      if (action.options.menus) {
        await this.drawRow((row) => {
          row.add('   ');
          row.add('menus:', { hl: helpHightlights.subtitle });
        });
        for (const menu of ActionMenu.getNormalizeMenus(action.options.menus)) {
          await this.drawRow((row) => {
            row.add('     - ');
            row.add(`${name}:${menu.args}`, { hl: helpHightlights.action });
            row.add(' ');
            row.add(menu.description, { hl: helpHightlights.description });
          });
        }
      }
    }
  }

  async drawColumns() {
    await this.drawRow((row) => {
      row.add(`Columns for source(${this.source.sourceType})`, {
        hl: helpHightlights.title,
      });
    });
    const allColumns = this.source.sourcePainters.columnRegistrar
      .registeredColumns;
    for (const [type, columns] of allColumns) {
      await this.drawRow((row) => {
        row.add(`  Type: ${type}`, { hl: helpHightlights.subtitle });
      });
      for (const [name] of columns) {
        await this.drawRow((row) => {
          row.add('   - ');
          row.add(name, { hl: helpHightlights.column });
        });
      }
    }
  }

  async render() {
    this.explorer.nvim.pauseNotification();
    this.explorer
      .setLinesNotifier(
        this.drawnResults.map((n) => n.content),
        0,
        -1,
      )
      .notify();
    const highlightPositions: HighlightPositionWithLine[] = [];
    for (const [i, drawn] of this.drawnResults.entries()) {
      if (drawn.highlightPositions) {
        highlightPositions.push(
          ...drawn.highlightPositions.map((hl) => ({
            lineIndex: i,
            ...hl,
          })),
        );
      }
    }
    this.explorer.highlight.addHighlightsNotify(
      this.explorer.helpHlSrcId,
      highlightPositions,
    );
    await this.explorer.nvim.resumeNotification();
  }
}

export async function showHelp(
  explorer: Explorer,
  source: ExplorerSource<any>,
) {
  explorer.isHelpUI = true;
  const storeNode = await explorer.view.currentNode();

  const width = (await (await explorer.win)?.width) ?? 80;
  const helpPainter = new HelpPainter(explorer, source, width);
  await helpPainter.drawHead();
  await helpPainter.drawMappings();
  await helpPainter.drawHr();
  await helpPainter.drawActions();
  await helpPainter.drawHr();
  await helpPainter.drawColumns();
  await helpPainter.render();

  await explorer.explorerManager.clearMappings();

  const disposables: Disposable[] = [];
  ['<esc>', 'q', '?'].forEach((key) => {
    disposables.push(
      workspace.registerLocalKeymap(
        'n',
        key,
        async () => {
          disposeAll(disposables);
          await quitHelp(explorer);
          await Notifier.runAll([
            await explorer.renderAllNotifier(),
            await source.locator.gotoNodeNotifier(storeNode),
          ]);
        },
        true,
      ),
    );
  });
}

export async function quitHelp(explorer: Explorer) {
  await explorer.explorerManager.executeMappings();
  explorer.isHelpUI = false;
}
