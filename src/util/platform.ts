declare var __webpack_require__: any;
export const isWebpack = typeof __webpack_require__ === 'function';
export const isWindows = process.platform === 'win32';
export const isMacintosh = process.platform === 'darwin';
export const isLinux = process.platform === 'linux';
