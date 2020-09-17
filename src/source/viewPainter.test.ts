import { ViewRowPainter } from './viewPainter';
import { Explorer } from '../explorer';
import { ExplorerManager } from '../explorerManager';
import { BaseTreeNode, ExplorerSource } from './source';
import { ColumnRegistrar } from './columnRegistrar';
import { SourcePainters } from './sourcePainters';
import { workspace } from 'coc.nvim';
import { buildExplorerConfig, config } from '../config';
import { jestHelper } from 'coc-helper/JestHelper';
import { registerRuntimepath } from '../util';

let explorer: Explorer;

jestHelper.boot();

beforeAll(async () => {
  await registerRuntimepath(process.cwd());
});

interface TestNode extends BaseTreeNode<TestNode, 'root' | 'child'> {
  name: string;
  fullpath: string;
  directory: boolean;
}

class TestColumnRegistrar extends ColumnRegistrar<TestNode, any> {}

const testColumnRegistrar = new TestColumnRegistrar();

class TestSource extends ExplorerSource<TestNode> {
  hlSrcId = workspace.createNameSpace('coc-explorer-test');

  sourcePainters: SourcePainters<TestNode> = new SourcePainters(
    this,
    testColumnRegistrar,
  );

  rootNode: TestNode = {
    type: 'root',
    uid: '',
    level: 0,
    directory: false,
    name: '',
    fullpath: '',
  };

  async init() {}

  async open() {}

  async loadChildren() {
    return [];
  }
}

(['left', 'right', 'center'] as const).forEach((pos) => {
  testColumnRegistrar.registerColumn('child', `grow-${pos}`, () => ({
    draw() {
      return {
        async drawNode(row, { node }) {
          await row.flexible(
            {
              grow: pos,
            },
            () => {
              row.add(node.name);
              row.add(' ');
              row.add(node.fullpath);
            },
          );
        },
      };
    },
  }));
  testColumnRegistrar.registerColumn('child', `omit-${pos}`, () => ({
    draw() {
      return {
        async drawNode(row, { node }) {
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
      };
    },
  }));
});

testColumnRegistrar.registerColumn('child', 'filename', () => ({
  draw() {
    return {
      async drawNode(row, { node }) {
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
    };
  },
}));

testColumnRegistrar.registerColumn('child', 'link', () => ({
  draw() {
    return {
      async drawNode(row, { node }) {
        await row.flexible(
          {
            omit: 'center',
            omitVolume: 5,
            grow: 'right',
          },
          () => {
            row.add('→ ' + node.fullpath);
            row.add(' ');
          },
        );
      },
    };
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
        workspaceState: undefined as any,
        globalState: undefined as any,
        logger: undefined as any,
      }),
      0,
      undefined,
      buildExplorerConfig(config),
    );
  }
  explorer.contentWidth = width;
  const node: TestNode = {
    type: 'child',
    uid: 'file:///1',
    isRoot: false,
    level: 0,
    name: 'name',
    fullpath: '/path/to/file',
    directory: true,
  };
  const source = new TestSource('test', explorer);
  await source.sourcePainters.parseTemplate(
    'child',
    names.map((n) => `[${n}]`).join(''),
  );
  return (
    (await source.sourcePainters.beforeDraw([node], {
      async draw() {
        const viewPainter = source.sourcePainters.viewPainter;
        const row = new ViewRowPainter(viewPainter);
        row.add('||');
        for (const part of source.sourcePainters.getPainter('child').parts) {
          await row.addTemplatePart(node, 1, part);
        }
        const r = await row.draw();
        return r.content;
      },
    })) ?? ''
  );
}

describe('ViewRowPainter.draw()', () => {
  // '||name /path/to/file'

  test('grow left', async () => {
    const content = await drawColumn(['grow-left'], 30);
    expect(content).toBe('||          name /path/to/file');
  });

  test('grow right', async () => {
    const content = await drawColumn(['grow-right'], 30);
    expect(content).toBe('||name /path/to/file          ');
  });

  test('grow center', async () => {
    const content = await drawColumn(['grow-center'], 30);
    expect(content).toBe('||     name /path/to/file     ');
  });

  test('omit left', async () => {
    const content = await drawColumn(['omit-left'], 15);
    expect(content).toBe('||‥path/to/file');
  });

  test('omit right', async () => {
    const content = await drawColumn(['omit-right'], 15);
    expect(content).toBe('||name /path/t‥');
  });

  test('omit center', async () => {
    const content = await drawColumn(['omit-center'], 15);
    expect(content).toBe('||name /‥o/file');
  });

  test('filename & link', async () => {
    let content = await drawColumn(['filename', 'link'], 30);
    expect(content).toBe('||name → /path/to/file        ');

    content = await drawColumn(['filename', 'link'], 20);
    expect(content).toBe('||n‥e → /pat‥o/file ');
  });
});
