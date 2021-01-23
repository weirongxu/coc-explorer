import { jestHelper } from 'coc-helper/JestHelper';
import pathLib from 'path';
import { FileNode, FileSource } from '../source/sources/file/fileSource';
import { normalizePath } from '../util';
import { FileSourceHelper } from '../__test__/helpers/fileSource';
import { bootSource } from '../__test__/helpers/helper';

jestHelper.boot();

const { loadChildren } = FileSourceHelper.genLoadChildren({
  name: pathLib.sep,
  children: [
    {
      name: 'src',
      children: [
        {
          name: 'test',
          children: [
            {
              name: 'fixtures',
              children: [{ name: 'fixtures.json' }],
            },
            {
              name: 'helper.js',
            },
          ],
        },
        {
          name: 'core',
          children: [{ name: 'index.js' }],
        },
        {
          name: 'lib',
          children: [
            {
              name: 'libA',
            },
            {
              name: 'libB',
            },
          ],
        },
      ],
    },
  ],
});

class TestFileSource extends FileSource {
  async loadChildren(parentNode: FileNode) {
    return loadChildren(parentNode);
  }
}

const context = bootSource((explorer) => new TestFileSource('test', explorer));

test('flattenChildren', async () => {
  const { source } = context;
  source.root = pathLib.sep;
  source.bootInit(true);
  await source.bootOpen(true);
  await source.load(source.view.rootNode);
  await source.view.expand(source.view.rootNode, {
    recursive: true,
  });
  const nodes = source.view.flattenNode(source.view.rootNode);
  expect(nodes.map((n) => n.fullpath)).toEqual(
    [
      '/',
      '/src',
      '/src/test',
      '/src/test/fixtures',
      '/src/test/fixtures/fixtures.json',
      '/src/test/helper.js',
      '/src/core',
      '/src/core/index.js',
      '/src/lib',
      '/src/lib/libA',
      '/src/lib/libB',
    ].map(normalizePath),
  );
});
