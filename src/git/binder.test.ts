import { Notifier } from 'coc-helper';
import pathLib from 'path';
import type {
  BaseTreeNode,
  ExplorerSource,
  SourceOptions,
} from '../source/source';
import { FileNode, FileSource } from '../source/sources/file/fileSource';
import { normalizePath } from '../util';
import { rendererSourceSymbol } from '../view/rendererSource';
import { FileSourceHelper } from '../__test__/helpers/fileSource';
import { bootSource, mockWorkspace } from '../__test__/helpers/helper';
import { GitBinder } from './binder';
import { gitManager } from './manager';
import { GitFormat, GitMixedStatus } from './types';

mockWorkspace();

const { loadChildren } = FileSourceHelper.genLoadChildren({
  name: pathLib.sep,
  children: [
    {
      name: 'lib',
      children: [
        {
          name: 'folder',
          children: [],
        },
        {
          name: 'index.js',
        },
      ],
    },
    {
      name: 'src',
      children: [
        {
          name: 'main.ts',
        },
      ],
    },
    {
      name: 'tests',
      children: [
        {
          name: 'test.ts',
        },
      ],
    },
    {
      name: 'readme.md',
    },
    {
      name: 'jest.js',
    },
    {
      name: 'package.json',
    },
  ],
});

class TestFileSource extends FileSource {
  async loadChildren(parentNode: FileNode): Promise<FileNode[]> {
    return loadChildren(parentNode);
  }
}

const context = bootSource((explorer) => new TestFileSource('test', explorer));

test('GitBinder.reload', async () => {
  const { source } = context;
  source.root = pathLib.sep;
  const binder = new GitBinder();
  binder.bind(source as ExplorerSource<any>);
  source.bootInit(true);
  await source.bootOpen(true);
  await source.load(source.view.rootNode);

  const renderPaths = new Set<string>();

  Object.defineProperty(
    source.view[rendererSourceSymbol],
    'renderNodesNotifier',
    {
      writable: true,
      value: jest
        .fn()
        .mockImplementation(
          (nodes: SourceOptions.RenderNodes<BaseTreeNode<any>>) => {
            [...nodes].forEach((node) => {
              if ('uid' in node) {
                renderPaths.add(node.fullpath!);
              } else {
                for (const n of node.nodes) {
                  renderPaths.add(n.fullpath!);
                }
              }
            });
            return Notifier.noop();
          },
        ),
    },
  );

  Object.defineProperty(gitManager, 'getGitRoot', {
    writable: true,
    value: jest.fn().mockImplementation(() => pathLib.sep),
  });

  const expectReloadGit = async (
    statuses: string[],
    expectRenderPaths: string[],
  ) => {
    Object.defineProperty(gitManager.cmd, 'spawn', {
      writable: true,
      value: jest.fn().mockImplementation(() => statuses.join('\n')),
    });
    renderPaths.clear();
    // @ts-ignore
    await binder.reload(binder.sources, ['/'], false);

    expect(renderPaths).toEqual(new Set<string>(expectRenderPaths));
  };

  await expectReloadGit(
    ['!! lib/', ' M src/main.ts', 'M  readme.md', ' M package.json'],
    ['/', '/lib', '/src', '/readme.md', '/package.json'].map(normalizePath),
  );

  expect(
    gitManager.getMixedStatus(normalizePath('/lib/index.js'), false),
  ).toEqual({
    x: GitFormat.ignored,
    y: GitFormat.unmodified,
  } as GitMixedStatus);

  expect(
    gitManager.getMixedStatus(normalizePath('/lib/folder'), false),
  ).toEqual({
    x: GitFormat.ignored,
    y: GitFormat.unmodified,
  } as GitMixedStatus);

  await expectReloadGit(
    ['!! lib/', ' M src/main.ts', 'M  readme.md'],
    ['/package.json'].map(normalizePath),
  );
});
