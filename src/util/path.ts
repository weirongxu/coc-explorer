import os from 'os';
import pathLib from 'path';
import { isWindows } from './platform';

/**
 * Get extensions and basename
 * @example
 * ```
 * const { basename, extensions } = parseExtensions('/path/to/file.txt')
 * // basename: 'file'
 * // extensions: ['txt']
 * const { basename, extensions } = parseExtensions('foo.js')
 * // basename: 'foo'
 * // extensions: ['js']
 * const { basename, extensions } = parseExtensions('foo.js.map')
 * // basename: 'foo'
 * // extensions: ['js', 'map']
 * const { basename, extensions } = parseExtensions('foo')
 * // basename: 'foo'
 * // extensions: undefined
 * ```
 */
export function getExtensions(filename: string) {
  const parts = pathLib.basename(filename).split('.');
  const [basename, ...extensions] = parts;
  if (basename) {
    return { basename, extensions };
  } else {
    // special case for hidden files
    const [basename2, ...extensions2] = extensions;
    return {
      basename: [basename, basename2].join('.'),
      extensions: extensions2,
    };
  }
}

/**
 * Normalized path
 * @example
 * ```
 * normalizePath('/path/to/file.txt')
 * // '/path/to/file.txt'
 * normalizePath('/path/to/../file.txt')
 * // '/path/file.txt'
 * normalizePath('~/path/to/file.txt')
 * // '/Users/username/path/to/file.txt'
 *
 * // For windows
 * normalizePath('c:/path/to/file.txt')
 * // 'C:\\path\\to\\file.txt'
 */
export function normalizePath(path: string): string {
  let _path = pathLib.normalize(path);
  if (_path[0] === '~') {
    _path = pathLib.join(os.homedir(), _path.slice(1));
  }
  if (isWindows && /[a-z]:/.test(_path)) {
    const driveChar = _path[0]?.toUpperCase() ?? '';
    _path = driveChar + _path.slice(1);
  }
  return _path;
}

/**
 * Determine if a path is parent of another path
 */
export function isParentFolder(folder: string, filepath: string): boolean {
  let finalFolder = normalizePath(pathLib.resolve(folder));
  const finalFilepath = normalizePath(pathLib.resolve(filepath));
  if (finalFolder === '//') finalFolder = '/';
  if (finalFolder.endsWith(pathLib.sep))
    return finalFilepath.startsWith(finalFolder);
  return (
    finalFilepath.startsWith(finalFolder) &&
    finalFilepath[finalFolder.length] === pathLib.sep
  );
}
