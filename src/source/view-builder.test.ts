import { SourceRowBuilder, SourceViewBuilder } from './view-builder';
import { Explorer } from '../explorer';
import { ExplorerManager } from '../explorer-manager';
import { BaseTreeNode } from './source';
import { ColumnRegistrar } from './column-registrar';
import helper from './../tests/help-test';

let explorer: Explorer;

beforeAll(async () => {
  await helper.setup();
});

interface TestNode extends BaseTreeNode<TestNode> {
  name: string;
  fullpath: string;
  directory: boolean;
}

class TestColumnRegistrar extends ColumnRegistrar<TestNode, any> {}

const testColumnRegistrar = new TestColumnRegistrar();

(['left', 'right', 'center'] as const).forEach((pos) => {
  testColumnRegistrar.registerColumn(`align-${pos}`, () => ({
    async draw(row, node) {
      await row.flexible(
        {
          align: pos,
        },
        () => {
          row.add(node.name);
          row.add(' ');
          row.add(node.fullpath);
        },
      );
    },
  }));
  testColumnRegistrar.registerColumn(`omit-${pos}`, () => ({
    async draw(row, node) {
      await row.flexible(
        {
          omit: pos,
        },
        () => {
          row.add(node.name);
          row.add(' ');
          row.add(node.fullpath);
        },
      );
    },
  }));
});

testColumnRegistrar.registerColumn('filename', () => ({
  async draw(row, node) {
    await row.flexible(
      {
        omit: 'center',
      },
      () => {
        row.add(node.name);
        row.add(' ');
      },
    );
  },
}));

testColumnRegistrar.registerColumn('link', () => ({
  async draw(row, node) {
    await row.flexible(
      {
        omit: 'center',
        align: 'right',
      },
      () => {
        row.add('→ ' + node.fullpath);
        row.add(' ');
      },
    );
  },
}));

async function drawColumn(names: string[], width: number) {
  if (!explorer) {
    explorer = new Explorer(
      0,
      new ExplorerManager({
        subscriptions: [],
        extensionPath: '',
        asAbsolutePath() {
          return '';
        },
        storagePath: '',
        workspaceState: null as any,
        globalState: null as any,
        logger: null as any,
      }),
      0,
    );
  }
  const view = new SourceViewBuilder(explorer);
  const r = new SourceRowBuilder(view);
  r.add('||');
  const columns = await Promise.all(
    names.map((name) => testColumnRegistrar.getInitedColumn(null as any, name)),
  );
  for (const column of columns) {
    await r.addTemplatePart<TestNode>(
      {
        uid: '1',
        drawnLine: '',
        isRoot: false,
        level: 0,
        name: 'name',
        fullpath: '/path/to/file',
        directory: true,
      },
      1,
      { column },
    );
  }
  explorer.contentWidth = width;
  return r.draw();
}

describe('SourceRowBuilder.draw()', () => {
  // '||name /path/to/file'

  test('align left', async () => {
    const r = await drawColumn(['align-left'], 30);
    expect(r.content).toBe('||          name /path/to/file');
  });

  test('align right', async () => {
    const r = await drawColumn(['align-right'], 30);
    expect(r.content).toBe('||name /path/to/file          ');
  });

  test('align center', async () => {
    const r = await drawColumn(['align-center'], 30);
    expect(r.content).toBe('||     name /path/to/file     ');
  });

  test('omit left', async () => {
    const r = await drawColumn(['omit-left'], 15);
    expect(r.content).toBe('||‥path/to/file');
  });

  test('omit right', async () => {
    const r = await drawColumn(['omit-right'], 15);
    expect(r.content).toBe('||name /path/t‥');
  });

  test('omit center', async () => {
    const r = await drawColumn(['omit-center'], 15);
    expect(r.content).toBe('||name /‥o/file');
  });

  test.only('filename and link', async () => {
    let r = await drawColumn(['filename', 'link'], 30);
    expect(r.content).toBe('||name → /path/to/file        ');

    r = await drawColumn(['filename', 'link'], 20);
    // TOD expect '||n‥e → /pat‥o/file '
    expect(r.content).toBe('||n‥ → /pat‥o/file ');
  });
});
