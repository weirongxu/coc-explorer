import { Disposable, workspace, disposeAll } from 'coc.nvim';
import { conditionActionRules } from './actions/condition';
import { Explorer } from './explorer';
import { keyMapping } from './mappings';
import {
  HighlightPosition,
  HighlightPositionWithLine,
  hlGroupManager,
} from './source/highlightManager';
import { BaseTreeNode, ExplorerSource } from './source/source';
import { ViewPainter, ViewRowPainter } from './source/viewPainter';
import { DrawBlock, Notifier } from './util';
import { Action, ActionExp } from './actions/types';
import { RegisteredAction } from './actions/registered';

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
  conditional: hl('HelpConditional', 'Conditional'),
};

export class HelpPainter {
  painter: ViewPainter;
  drawnResults: {
    highlightPositions: HighlightPosition[];
    content: string;
  }[] = [];
  registeredActions: RegisteredAction.Map<BaseTreeNode<any>>;

  constructor(
    private explorer: Explorer,
    private source: ExplorerSource<any>,
    private width: number,
  ) {
    this.painter = new ViewPainter(explorer);

    this.registeredActions = {
      ...this.explorer.globalActions,
      ...this.source.actions,
    };
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

  private async drawActionExp(
    actionExp: ActionExp,
    indent: string,
    drawBlocks: DrawBlock[] = [],
  ) {
    if (Array.isArray(actionExp)) {
      for (var i = 0; i < actionExp.length; i++) {
        const action = actionExp[i];
        if (Array.isArray(action)) {
          await this.drawActionExp(action, indent, drawBlocks);
        } else {
          const rule = conditionActionRules[action.name];
          if (rule) {
            drawBlocks.push((row) => {
              row.add(indent);
              row.add('if ' + rule.getDescription(action.args) + ' ', {
                hl: helpHightlights.conditional,
              });
            });
            await this.drawActionExp(
              actionExp[i + 1],
              indent + '  ',
              drawBlocks,
            );
            drawBlocks.push((row) => {
              row.add(indent);
              row.add('else ', { hl: helpHightlights.conditional });
            });
            await this.drawActionExp(
              actionExp[i + 2],
              indent + '  ',
              drawBlocks,
            );
            i += 2;
          } else {
            await this.drawActionExp(action, indent, drawBlocks);
          }
        }
      }
    } else {
      drawBlocks.push((row) => {
        row.add(indent);
        this.drawActionForMapping(row, actionExp);
      });
    }
    return drawBlocks;
  }

  /**
   * <cr> - if expandable?
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
      const drawBlocks = await this.drawActionExp(actionExp, '');

      if (!drawBlocks.length) {
        continue;
      }

      await this.drawRow(async (row) => {
        row.add(' ');
        row.add(key, { hl: helpHightlights.mappingKey });
        row.add(' - ');
        await drawBlocks[0](row);
      });

      const indent = ' '.repeat(key.length + 4);
      for (const drawBlock of drawBlocks.slice(1)) {
        await this.drawRow(async (row) => {
          row.add(indent);
          await drawBlock(row);
        });
      }
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
        for (let i = 0; i < action.options.args.length; i++) {
          const arg = action.options.args[i];
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
        for (const menu of RegisteredAction.getNormalizeMenus(
          action.options.menus,
        )) {
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
    for (let i = 0; i < this.drawnResults.length; i++) {
      const drawn = this.drawnResults[i];
      if (drawn.highlightPositions) {
        highlightPositions.push(
          ...drawn.highlightPositions.map((hl) => ({
            lineIndex: i,
            ...hl,
          })),
        );
      }
    }
    this.explorer.addHighlightsNotify(
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
  const storeNode = await explorer.currentNode();

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
            await source.gotoNodeNotifier(storeNode),
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
