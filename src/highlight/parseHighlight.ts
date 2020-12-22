import { range } from 'lodash-es';
import { ParserError, ParserSource } from '../parser/parser';

function parseWord(s: ParserSource, name: string) {
  let word = '';
  do {
    const ch = s.ch();
    if (ch === ' ') {
      break;
    } else {
      word += ch;
      s.next();
    }
  } while (!s.end());
  if (!word.length) {
    throw new ParserError(s, `Keyword ${name} is empty`);
  }
  return word;
}

function parseGroup(s: ParserSource) {
  return parseWord(s, 'group');
}

function parseXXX(s: ParserSource) {
  for (const _ of range(3)) {
    if (s.ch() === 'x') {
      s.next();
    } else {
      throw new ParserError(s, 'Parse xxx');
    }
  }
}

function parseAttrs(s: ParserSource) {
  const attrs: HighlightStatement['attrs'] = {};
  let name = '';
  let value = '';
  let state: 'name' | 'value' = 'name';
  const addAttr = () => {
    if (state === 'name') {
      attrs[name] = '';
    } else if (state === 'value') {
      attrs[name] = value;
    }
    name = '';
    value = '';
  };
  do {
    const ch = s.ch();
    if (ch === ' ') {
      skipSpace(s);
      addAttr();
      state = 'name';
    } else if (ch === '=') {
      state = 'value';
      s.next();
    } else {
      if (state === 'name') {
        name += ch;
      } else if (state === 'value') {
        value += ch;
      }
      s.next();
    }
  } while (!s.end());
  addAttr();
  return attrs;
}

function parseLinkTo(s: ParserSource) {
  if (s.match('links to', { skip: true })) {
    skipSpace(s);
    return parseWord(s, 'LinkTarget');
  }
}

function skipSpace(s: ParserSource) {
  do {
    s.next();
  } while (s.ch() === ' ');
}

export type HighlightStatement = {
  group: string;
  attrs?: Record<string, string>;
  linkTo?: string;
};

export function parseHighlight(str: string): HighlightStatement {
  const s = new ParserSource(str, 0);
  const group = parseGroup(s);
  skipSpace(s);
  parseXXX(s);
  skipSpace(s);
  const linkTo = parseLinkTo(s);
  if (linkTo) {
    return { group, linkTo };
  }
  const attrs = parseAttrs(s);
  return { group, attrs };
}
