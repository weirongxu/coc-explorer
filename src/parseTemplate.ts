/**
 * buffer root
 * '[icon] [title]'
 *
 * buffer
 * '  [selection | 1] [bufnr] [name][modified][readonly] [fullpath]'
 * '[bufname][fullpath][modified][readonly]'
 *
 * file root
 * '[icon] [title] [root] [fullpath]'
 * '[fullpath]'
 *
 * file
 * '[git | 2] [selection | clip | 1] [indent][icon | 1] [diagnosticError][filename growLeft 2 omitCenter 1][readonly] [linkIcon & 1][link]'
 * '[fullpath][link][diagnosticError][size][accessed][modified][created][readonly]'
 *
 * git root
 * '[icon] [title] [filepath]'
 * '[filepath][status][stash]'
 *
 * git
 * '[status] [filepath]'
 * '[status-plain] [filepath]'
 */

export type TemplateColumn = {
  column: string;
  modifiers?: { name: string; column: string }[];
};

export type TemplatePart = TemplateColumn | string;

class Source {
  constructor(public readonly s: string, public i: number) {}

  ch() {
    return this.s[this.i];
  }

  next() {
    this.i += 1;
  }

  end(): boolean {
    return this.i >= this.s.length;
  }
}

class ParseError extends Error {
  constructor(public source: Source, message: string) {
    super(message);
  }
}

function parseKeyword(name: string, s: Source, endWith: string[]) {
  let keyword = '';
  while (!s.end()) {
    const ch = s.ch();
    if (!endWith.includes(ch)) {
      keyword += ch;
      s.next();
    } else {
      return keyword;
    }
  }
  throw new ParseError(s, `Unexpected end when parse ${name}`);
}

function parseModifierName(s: Source) {
  return parseKeyword('modifier name', s, [' ']);
}

function parseModifierColumn(s: Source) {
  return parseKeyword('modifier value', s, [' ', ']']);
}

function parseModifier(s: Source) {
  const name = parseModifierName(s);
  s.next();
  const column = parseModifierColumn(s);
  return { name, column } as const;
}

function parseModifiers(s: Source) {
  const modifiers: { name: string; column: string }[] = [];
  do {
    const ch = s.ch();
    if (ch === ' ') {
      s.next();
      modifiers.push(parseModifier(s));
    } else if (ch === ']') {
      return modifiers;
    }
  } while (true);
}

function parseColumnName(s: Source) {
  return parseKeyword('column name', s, [' ', ']']);
}

function parseColumn(s: Source): TemplateColumn {
  s.next();
  const parsedColumn: TemplateColumn = {
    column: parseColumnName(s),
  };
  do {
    const ch = s.ch();
    if (ch === ']') {
      s.next();
      return parsedColumn;
    } else if (ch === ' ') {
      parsedColumn.modifiers = parseModifiers(s);
    }
  } while (!s.end());
  throw new ParseError(s, `Unexpected end when parse column block`);
}

function parseString(s: Source): string {
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
  const s = new Source(str, 0);
  const columns: TemplatePart[] = [];
  while (!s.end()) {
    const ch = s.ch();
    if (ch === '[') {
      columns.push(parseColumn(s));
    } else {
      columns.push(parseString(s));
    }
  }
  return columns;
}
