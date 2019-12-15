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
    extensions: ['js', 'ts', 'erb'],
    basename: 'temp',
  });

  expect(getExtensions('.temp.js.ts.erb')).toEqual({
    extensions: ['js', 'ts', 'erb'],
    basename: '.temp',
  });
});
