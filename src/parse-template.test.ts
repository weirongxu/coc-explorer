import { parseTemplate } from './parse-template';

describe('parse columns', () => {
  test('buffer root columns', () => {
    expect(parseTemplate('[icon] [title]')).toEqual([{ column: 'icon' }, ' ', { column: 'title' }]);
  });

  test('buffer columns', () => {
    expect(parseTemplate('[selection | 1] [bufnr] [name][modified][readonly] [fullpath]')).toEqual([
      { column: 'selection', modifiers: [{ name: '|', column: '1' }] },
      ' ',
      { column: 'bufnr' },
      ' ',
      { column: 'name' },
      { column: 'modified' },
      { column: 'readonly' },
      ' ',
      { column: 'fullpath' },
    ]);
  });

  test('file root columns', () => {
    expect(parseTemplate('[icon] [title] [root] [fullpath]')).toEqual([
      { column: 'icon' },
      ' ',
      { column: 'title' },
      ' ',
      { column: 'root' },
      ' ',
      { column: 'fullpath' },
    ]);
  });

  test('file columns', () => {
    expect(
      parseTemplate(
        '[git | 2] [selection | clip | 1] [indent][icon | 1] [diagnosticError][filename omitCenter 1][readonly] [linkIcon & 1][link growLeft 1 omitCenter 3]',
      ),
    ).toEqual([
      { column: 'git', modifiers: [{ name: '|', column: '2' }] },
      ' ',
      {
        column: 'selection',
        modifiers: [
          { name: '|', column: 'clip' },
          { name: '|', column: '1' },
        ],
      },
      ' ',
      { column: 'indent' },
      { column: 'icon', modifiers: [{ name: '|', column: '1' }] },
      ' ',
      { column: 'diagnosticError' },
      {
        column: 'filename',
        modifiers: [{ name: 'omitCenter', column: '1' }],
      },
      { column: 'readonly' },
      ' ',
      { column: 'linkIcon', modifiers: [{ name: '&', column: '1' }] },
      {
        column: 'link',
        modifiers: [
          { name: 'growLeft', column: '1' },
          { name: 'omitCenter', column: '3' },
        ],
      },
    ]);
  });

  test('git columns', () => {
    expect(parseTemplate('[status-plain] [filepath]')).toEqual([
      { column: 'status-plain' },
      ' ',
      {
        column: 'filepath',
      },
    ]);
  });
});
