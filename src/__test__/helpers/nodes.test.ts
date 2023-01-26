import pathLib from 'path';
import type { BaseTreeNode } from '../../source/source';
import { NodesHelper } from './nodes';

test('flattenNodes', () => {
  const { genNode: g } = NodesHelper;
  const flattenedNodes = NodesHelper.flattenNodes<BaseTreeNode<any>>(
    g(pathLib.sep, [
      g('src', [
        g('test', [g('fixtures', [g('fixtures.json')]), g('helper.js')]),
        g('core', [g('index.js')]),
        g('lib', [g('libA'), g('libB')]),
      ]),
    ]),
  );
  expect(flattenedNodes.map((n) => n.fullpath)).toEqual([
    pathLib.sep,
    'src',
    'test',
    'fixtures',
    'fixtures.json',
    'helper.js',
    'core',
    'index.js',
    'lib',
    'libA',
    'libB',
  ]);
});
