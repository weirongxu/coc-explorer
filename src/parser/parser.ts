export class ParserSource {
  constructor(
    public readonly s: string,
    public i: number,
  ) {}

  ch() {
    return this.s[this.i];
  }

  skip(n: number) {
    this.i += n;
  }

  next() {
    this.i += 1;
  }

  forwardString(length: number) {
    return this.s.slice(this.i, this.i + length);
  }

  match(
    str: string,
    options: {
      /**
       * @default false
       */
      skip?: boolean;
    } = {},
  ) {
    if (this.forwardString(str.length) === str) {
      if (options.skip ?? false) {
        this.skip(str.length);
      }
      return true;
    }
    return false;
  }

  end(): boolean {
    return this.i >= this.s.length;
  }
}

export class ParserError extends Error {
  constructor(
    public source: ParserSource,
    message: string,
  ) {
    super(message);
  }
}
