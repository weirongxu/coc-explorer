import { getExtensions } from '.';

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
    extensions: ['erb', 'ts', 'js'],
    basename: 'temp',
  });

  expect(getExtensions('.temp.js.ts.erb')).toEqual({
    extensions: ['erb', 'ts', 'js'],
    basename: '.temp',
  });
});
