import { getExtensions } from '.';
import { isParentFolder } from './path';

test('getExtensions', () => {
  expect(getExtensions('test.png')).toEqual({
    extensions: ['png'],
    basename: 'test',
  });

  expect(getExtensions('t.png')).toEqual({
    extensions: ['png'],
    basename: 't',
  });

  expect(getExtensions('t.png')).toEqual({
    extensions: ['png'],
    basename: 't',
  });

  expect(getExtensions('temp.js.ts.erb')).toEqual({
    extensions: ['js', 'ts', 'erb'],
    basename: 'temp',
  });

  expect(getExtensions('.temp.js.ts.erb')).toEqual({
    extensions: ['js', 'ts', 'erb'],
    basename: '.temp',
  });
});

test('isParentFolder', () => {
  expect(isParentFolder('/path', '/path/to/test.md')).toEqual(true);
  expect(isParentFolder('/path/', '/path/to/test.md')).toEqual(true);
  expect(isParentFolder('/path-test', '/path/to/test.md')).toEqual(false);
  expect(isParentFolder('/path-test/', '/path/to/test.md')).toEqual(false);
});
