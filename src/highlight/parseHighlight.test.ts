import { HighlightStatement, parseHighlight } from './parseHighlight';

const list: [string, HighlightStatement][] = [
  [
    'SpecialKey     xxx ctermfg=81 guifg=#585858',
    {
      group: 'SpecialKey',
      attrs: {
        ctermfg: '81',
        guifg: '#585858',
      },
    },
  ],
  [
    'TermCursorNC   xxx cleared',
    {
      group: 'TermCursorNC',
      attrs: {
        cleared: '',
      },
    },
  ],
  [
    'StatusLine     xxx cterm=bold,reverse gui=bold,reverse guifg=#5f8787 guibg=#1c1c1c',
    {
      group: 'StatusLine',
      attrs: {
        cterm: 'bold,reverse',
        gui: 'bold,reverse',
        guifg: '#5f8787',
        guibg: '#1c1c1c',
      },
    },
  ],
  [
    'NvimAssignment xxx links to Operator',
    {
      group: 'NvimAssignment',
      linkTo: 'Operator',
    },
  ],
];

list.forEach(([str, highlight]) => {
  test(str, () => {
    expect(parseHighlight(str)).toEqual(highlight);
  });
});
