module 'dotignore' {
  export declare interface IgnoreMatcher {
    constructor(str: string);
    delimiter: string;
    shouldIgnore(filename: string): boolean;
  }
  export declare function createMatcher(ignoreFileStr: string): IgnoreMatcher;
}
