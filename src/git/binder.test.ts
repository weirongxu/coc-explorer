import { Notifier } from 'coc-helper';
import { jestHelper } from 'coc-helper/JestHelper';
import pathLib from 'path';
import { buildExplorerConfig, configLocal } from '../config';
import { Explorer } from '../explorer';
import { ExplorerManager } from '../explorerManager';
import { Args } from '../parseArgs';
import { ExplorerSource } from '../source/source';
import { FileNode, FileSource } from '../source/sources/file/fileSource';
import { normalizePath } from '../util';
import { GitBinder } from './binder';
import { gitManager } from './manager';
import { GitFormat, GitMixedStatus } from './types';

jestHelper.boot();

class TestSource extends FileSource {
  async loadChildren(parentNode: FileNode): Promise<FileNode[]> {
    const genNode = (node: {
      fullpath: string;
      directory: boolean;
    }): FileNode => {
      node.fullpath = normalizePath(node.fullpath);
      return {
        ...node,
        name: pathLib.basename(node.fullpath),
        uid: this.helper.getUid(node.fullpath),
        type: 'child',
        hidden: false,
        readable: true,
        readonly: false,
        writable: true,
        executable: false,
        symbolicLink: false,
      };
    };
    if (parentNode.fullpath === pathLib.sep) {
      return [
        {
          directory: true,
          fullpath: '/lib',
        },
        {
          directory: true,
          fullpath: '/src',
        },
        {
          directory: false,
          fullpath: '/readme.md',
        },
        {
          directory: false,
          fullpath: '/jest.js',
        },
        {
          directory: false,
          fullpath: '/package.json',
        },
      ].map(genNode);
    } else if (parentNode.fullpath === `${pathLib.sep}lib`) {
      return [
        {
          directory: true,
          fullpath: 'lib/folder',
        },
        {
          directory: false,
          fullpath: 'lib/index.js',
        },
      ].map(genNode);
    } else if (parentNode.fullpath === `${pathLib.sep}src`) {
      return [
        {
          directory: false,
          fullpath: 'src/test.ts',
        },
      ].map(genNode);
    } else {
      return [];
    }
  }
}

let explorer: Explorer;

beforeAll(() => {
  const config = configLocal();
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
});

test('GitBinder.reload', async () => {
  const source = new TestSource('test', explorer);
  // @ts-ignore
  explorer._sources = [source];
  // @ts-ignore
  explorer._args = new Args([]);
  // @ts-ignore
  explorer._rootUri = pathLib.sep;
  source.root = pathLib.sep;
  const binder = new GitBinder();
  binder.bind(source as ExplorerSource<any>);
  source.bootInit(true);
  await source.bootOpen(true);
  await source.load(source.view.rootNode);
  await source.view.expand(source.view.rootNode.children![0]!);

  const renderPaths = new Set<string>();

  Object.defineProperty(source.view, 'renderNodesNotifier', {
    writable: true,
    value: jest.fn().mockImplementation((nodes: FileNode[]) => {
      nodes.forEach((node) => {
        renderPaths.add(node.fullpath);
      });
      return Notifier.noop();
    }),
  });

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
    ['!! lib/', ' M src/test.ts', 'M  readme.md', ' M package.json'],
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
    ['!! lib/', ' M src/test.ts', 'M  readme.md'],
    ['/package.json'].map(normalizePath),
  );
});
