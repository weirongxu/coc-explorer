import { isWindows } from './platform';

export function generateUri(path: string, scheme: string = 'file') {
  if (scheme === 'file' && isWindows && /^[A-Za-z]:/.test(path)) {
    path = '/' + path;
  }
  return scheme + '://' + path;
}
