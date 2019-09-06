import { SourceRowBuilder } from './view-builder';
import { ExplorerSource } from '.';
import { config } from '../util';
import { Disposable } from 'coc.nvim';

export interface ColumnDraw<Item> {
  init?(): void;

  validate?(): boolean | Promise<boolean>;

  load?(item: Item | null): void | Promise<void>;

  beforeDraw?(): void | Promise<void>;

  draw(row: SourceRowBuilder, item: Item): void;
}

export class BaseColumnManager<Item, S extends ExplorerSource<Item>, C extends ColumnDraw<Item>> {
  registeredColumns: Record<string, (fileSource: S) => C> = {};
  columnDraws: C[] = [];

  constructor(public columns: string[]) {}

  getColumnConfig<T>(name: string, defaultValue?: T): T {
    return config.get('file.column.' + name, defaultValue)!;
  }

  async init(source: S) {
    this.columnDraws = [];
    for (const c of this.columns) {
      const getColumn = this.registeredColumns[c];
      if (getColumn) {
        const column = getColumn(source);
        if (!column.validate || column.validate()) {
          this.columnDraws.push(column);
        }
      }
    }
    this.columnDraws.forEach((c) => {
      c.init && c.init();
    });
  }

  registerColumn(name: string, getFileColumn: C | ((fileSource: S) => C)) {
    if (typeof getFileColumn === 'function') {
      this.registeredColumns[name] = getFileColumn;
    } else {
      this.registeredColumns[name] = () => getFileColumn;
    }
    return Disposable.create(() => {
      delete this.registeredColumns[name];
    });
  }

  async load(item: Item | null) {
    for (const fileColumn of this.columnDraws) {
      await (fileColumn.load && fileColumn.load(item));
    }
  }

  beforeDraw() {
    this.columnDraws.forEach((column) => {
      column.beforeDraw && column.beforeDraw();
    });
  }

  drawItem(row: SourceRowBuilder, item: Item) {
    this.columnDraws.forEach((column) => {
      column.draw(row, item);
    });
  }
}
