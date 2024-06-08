/**
 * Template examples
 *
 * ## buffer root
 * '[icon] [title]'
 *
 * ## buffer
 * '  [selection | 1] [bufnr] [name][modified][readonly] [fullpath]'
 * '[bufname][fullpath][modified][readonly]'
 *
 * ## file root
 * '[icon] [title] [root] [fullpath]'
 * '[fullpath]'
 *
 * ## file
 * '[git | 2] [selection | clip | 1] [indent][icon | 1] [diagnosticError][filename growLeft 2 omitCenter 1][readonly] [linkIcon & 1][link]'
 * '[fullpath][link][diagnosticError][size][accessed][modified][created][readonly]'
 *
 * ## git root
 * '[icon] [title] [filepath]'
 * '[filepath][status][stash]'
 *
 * ## git
 * '[status] [filepath]'
 * '[status-plain] [filepath]'
 */

import { ParserError, ParserSource } from '../parser/parser';

export type OriginalTemplateBlock = {
  column: string;
  modifiers?: { name: string; column: string }[];
};

export type OriginalTemplatePart = OriginalTemplateBlock | string;

function parseKeyword(name: string, s: ParserSource, endWith: string[]) {
  let keyword = '';
  while (!s.end()) {
    const ch = s.ch();
    if (!ch) break;
    if (!endWith.includes(ch)) {
      keyword += ch;
      s.next();
    } else {
      return keyword;
    }
  }
  throw new ParserError(s, `Unexpected end when parse ${name}`);
}

function parseModifierName(s: ParserSource) {
  return parseKeyword('modifier name', s, [' ']);
}

function parseModifierColumn(s: ParserSource) {
  return parseKeyword('modifier value', s, [' ', ']']);
}

function parseModifier(s: ParserSource) {
  const name = parseModifierName(s);
  s.next();
  const column = parseModifierColumn(s);
  return { name, column } as const;
}

function parseModifiers(s: ParserSource) {
  const modifiers: { name: string; column: string }[] = [];
  do {
    const ch = s.ch();
    if (ch === ' ') {
      s.next();
      modifiers.push(parseModifier(s));
    } else if (ch === ']') {
      return modifiers;
    }
    // eslint-disable-next-line no-constant-condition, @typescript-eslint/no-unnecessary-condition
  } while (true);
}

function parseColumnName(s: ParserSource) {
  return parseKeyword('column name', s, [' ', ']']);
}

function parseColumn(s: ParserSource): OriginalTemplateBlock {
  s.next(); // skip a [
  const parsedColumn: OriginalTemplateBlock = {
    column: parseColumnName(s),
  };
  do {
    const ch = s.ch();
    if (ch === ']') {
      s.next(); // skip a ]
      return parsedColumn;
    } else if (ch === ' ') {
      parsedColumn.modifiers = parseModifiers(s);
    }
  } while (!s.end());
  throw new ParserError(s, 'Unexpected end when parse column block');
}

function parsePlainString(s: ParserSource): string {
  let str = '';
  while (!s.end()) {
    const ch = s.ch();
    if (ch === '\\') {
      s.next();
      str += s.ch();
    } else if (ch === '[') {
      return str;
    } else {
      str += ch;
    }
    s.next();
  }
  return str;
}

export function parseTemplate(str: string) {
  const s = new ParserSource(str, 0);
  const parts: OriginalTemplatePart[] = [];
  while (!s.end()) {
    const ch = s.ch();
    if (ch === '[') {
      parts.push(parseColumn(s));
    } else {
      parts.push(parsePlainString(s));
    }
  }
  return parts;
}
