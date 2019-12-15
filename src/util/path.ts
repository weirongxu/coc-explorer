import os from 'os';
import pathLib from 'path';
import { isWindows } from './platform';

/**
 * get extensions and basename
 */
export function getExtensions(filename: string) {
  function getExtensionsR(
    filename: string,
    extensions: string[],
  ): { basename: string; extensions: string[] } {
    if (filename.includes('.', 1)) {
      const extension = pathLib.extname(filename);
      extensions.unshift(extension.slice(1));
      return getExtensionsR(pathLib.basename(filename, extension), extensions);
    } else {
      return { basename: filename, extensions: extensions };
    }
  }

  return getExtensionsR(filename, []);
}

export function normalizePath(path: string): string {
  let _path = pathLib.normalize(path);
  if (_path[0] === '~') {
    _path = pathLib.join(os.homedir(), _path.slice(1));
  }
  if (isWindows && /[a-z]:/.test(_path)) {
    const driveChar = _path[0];
    _path = driveChar.toUpperCase() + _path.slice(1);
  }
  return _path;
}
