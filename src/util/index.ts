import { HelperLogger, prettyPrint } from 'coc-helper';
export * from './string';
export * from './symbol';
export * from './number';
export * from './collection';
export * from './async';
export * from './fs';
export * from './path';
export * from './throttleDebounce';
export * from './vim';
export * from './ui';
export * from './platform';
export * from './cli';
export * from './function';
export * from './uri';
export * from './color';

export const logger = new HelperLogger('explorer');

export { prettyPrint };
