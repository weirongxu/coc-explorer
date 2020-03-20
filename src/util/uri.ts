import { isWindows } from './platform';

export function generateUri(path: string, scheme: string) {
  if (isWindows && /^[A-Za-z]:/.test(path)) {
    path = '/' + path;
  }
  return scheme + '://' + path;
}
