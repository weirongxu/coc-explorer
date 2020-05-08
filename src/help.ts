import { Disposable, workspace } from 'coc.nvim';
import { conditionActionRules } from './actions';
import { Explorer } from './explorer';
import { Action, getMappings } from './mappings';
import {
  HighlightPosition,
  HighlightPositionWithLine,
  hlGroupManager,
} from './source/highlightManager';
import { ActionMap, BaseTreeNode, ExplorerSource } from './source/source';
import { ViewPainter, ViewRowPainter } from './source/viewPainter';
import { DrawBlock, Notifier } from './util';

const hl = hlGroupManager.linkGroup.bind(hlGroupManager);
const helpHightlights = {
  line: hl('HelpLine', 'Operator'),
  hint: hl('HelpHint', 'Comment'),
  title: hl('HelpTitle', 'Boolean'),
  mappingKey: hl('HelpMappingKey', 'PreProc'),
  action: hl('HelpAction', 'Identifier'),
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
  registeredActions: ActionMap<BaseTreeNode<any>>;

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
      row.add('(use q or <esc> return to explorer)', {
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

  async drawMappings() {
    await this.drawRow((row) => {
      row.add(`Mappings for source(${this.source.sourceType})`, {
        hl: helpHightlights.title,
      });
    });

    const mappings = await getMappings();
    for (const [key, actions] of Object.entries(mappings)) {
      if (!actions.some((action) => action.name in this.registeredActions)) {
        continue;
      }
      const indent = ' '.repeat(key.length + 4);
      for (let i = 0; i < actions.length; i++) {
        let row = new ViewRowPainter(this.painter);
        if (i === 0) {
          row.add(' ');
          row.add(key, { hl: helpHightlights.mappingKey });
          row.add(' - ');
        } else {
          row.add(indent);
        }
        const action = actions[i];
        const rule = conditionActionRules[action.name];
        if (rule) {
          row.add('if ' + rule.getDescription(action.args) + ' ', {
            hl: helpHightlights.conditional,
          });
          this.drawActionForMapping(row, actions[i + 1]);
          this.drawnResults.push(await row.draw());
          row = new ViewRowPainter(this.painter);
          row.add(indent);
          row.add('else ', { hl: helpHightlights.conditional });
          this.drawActionForMapping(row, actions[i + 2]);
          this.drawnResults.push(await row.draw());
          i += 2;
        } else {
          this.drawActionForMapping(row, action);
          this.drawnResults.push(await row.draw());
        }
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
      let row = new ViewRowPainter(this.painter);
      row.add(' ');
      row.add(name, { hl: helpHightlights.action });
      row.add(' ');
      row.add(action.description, { hl: helpHightlights.description });
      if (action.options.menu) {
        for (const [menuName, menu] of Object.entries(action.options.menu)) {
          this.drawnResults.push(await row.draw());
          row = new ViewRowPainter(this.painter);
          row.add('   ');
          row.add(`${name}:${menuName}`, { hl: helpHightlights.action });
          row.add(' ');
          row.add(menu, { hl: helpHightlights.description });
        }
      }
      this.drawnResults.push(await row.draw());
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
            line: i,
            ...hl,
          })),
        );
      }
    }
    this.explorer.replaceHighlightsNotify(
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
  await helpPainter.render();

  await explorer.explorerManager.clearMappings();

  const disposables: Disposable[] = [];
  ['<esc>', 'q'].forEach((key) => {
    disposables.push(
      workspace.registerLocalKeymap(
        'n',
        key,
        async () => {
          disposables.forEach((d) => d.dispose());
          await explorer.quitHelp();
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
