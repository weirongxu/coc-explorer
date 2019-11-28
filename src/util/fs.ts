import fs from 'fs';
import os from 'os';
import { promisify } from 'util';
import rimraf from 'rimraf';
import trash from 'trash';
import pathLib from 'path';
import { execCli } from './cli';
import { isWindows } from './platform';
import { input, prompt } from '.';

export const fsOpen = promisify(fs.open);
export const fsClose = promisify(fs.close);
export const fsTouch = async (path: string) => await fsClose(await fsOpen(path, 'w'));
export const fsMkdir = promisify(fs.mkdir);
export const fsReaddir = promisify(fs.readdir);
export const fsReadlink = promisify(fs.readlink);
export const fsAccess = (path: string, mode?: number) =>
  new Promise<boolean>((resolve) => {
    fs.access(path, mode, (err) => {
      err ? resolve(false) : resolve(true);
    });
  });
export const fsExists = fsAccess;
export const fsStat = promisify(fs.stat);
export const fsLstat = promisify(fs.lstat);
export const fsCopyFile = promisify(fs.copyFile);
export const fsRename = promisify(fs.rename);
export const fsTrash = (paths: string | string[]) => trash(paths, { glob: false });
export const fsRimraf = promisify(rimraf);

export async function fsCopyFileRecursive(sourcePath: string, targetPath: string) {
  const lstat = await fsLstat(sourcePath);
  if (lstat.isDirectory()) {
    await fsMkdir(targetPath, { recursive: true });
    const filenames = await fsReaddir(sourcePath);
    for (const filename of filenames) {
      await fsCopyFileRecursive(
        pathLib.join(sourcePath, filename),
        pathLib.join(targetPath, filename),
      );
    }
  } else {
    await fsCopyFile(sourcePath, targetPath);
  }
}

export async function fsMergeDirectory(
  sourceDir: string,
  targetDir: string,
  action: (source: string, target: string) => Promise<void>,
) {
  const filenames = await fsReaddir(sourceDir);
  for (const filename of filenames) {
    const sourcePath = pathLib.join(sourceDir, filename);
    const targetPath = pathLib.join(targetDir, filename);
    if (await fsExists(targetPath)) {
      const sourceLstat = await fsLstat(sourcePath);
      const targetLstat = await fsLstat(targetPath);
      if (sourceLstat.isDirectory() && targetLstat.isDirectory()) {
        await fsMergeDirectory(sourcePath, targetPath, action);
      } else {
        await fsTrash(targetPath);
        await action(sourcePath, targetPath);
      }
    } else {
      await action(sourcePath, targetPath);
    }
  }
}

export async function overwritePrompt<S extends string | null>(
  paths: { source: S; target: string }[],
  action: (source: S, target: string) => Promise<void>,
) {
  const finalAction = async (source: string | null, target: string) => {
    await fsMkdir(pathLib.dirname(target), { recursive: true });
    await action(source as S, target);
  };
  for (let i = 0, len = paths.length; i < len; i++) {
    const sourcePath = paths[i].source;
    const targetPath = paths[i].target;

    if (!(await fsExists(targetPath))) {
      await finalAction(sourcePath, targetPath);
      continue;
    }

    const sourceLstat = typeof sourcePath === 'string' ? await fsLstat(sourcePath) : null;
    const targetLstat = await fsLstat(targetPath);

    async function rename() {
      const newTargetPath = await input(`Rename: ${targetPath} -> `, targetPath, 'file');
      if (!newTargetPath) {
        i -= 1;
        return;
      }
      return finalAction(sourcePath, newTargetPath);
    }
    async function replace() {
      await fsTrash(targetPath);
      return finalAction(sourcePath, targetPath);
    }
    function quit() {
      i = len;
      return;
    }
    async function prompt_(choices: Record<string, null | (() => void | Promise<void>)> = {}) {
      choices = {
        skip: null,
        rename,
        'force replace': replace,
        ...choices,
        quit,
      };
      const answer = await prompt(`${targetPath} already exists.`, Object.keys(choices));
      if (answer && answer in choices) {
        return choices[answer]?.();
      }
    }

    if (sourcePath && sourceLstat?.isDirectory()) {
      if (targetLstat.isDirectory()) {
        await prompt_({
          merge: () => fsMergeDirectory(sourcePath!, targetPath, finalAction),
          'one by one': async () => {
            const files = await fsReaddir(sourcePath!);
            const paths = files.map((source) => ({
              source: source as S,
              target: pathLib.join(targetPath, pathLib.basename(source)),
            }));
            await overwritePrompt(paths, action);
          },
        });
      } else {
        await prompt_();
      }
    } else {
      if (targetLstat.isDirectory()) {
        await prompt_();
      } else {
        await prompt_();
      }
    }
  }
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

export async function listDrive(): Promise<string[]> {
  if (isWindows) {
    const content = await execCli('wmic', ['logicaldisk', 'get', 'name']);
    const list = content
      .split('\n')
      .map((d) => d.trim())
      .filter((d) => d.endsWith(':'));
    return list;
  } else {
    throw new Error('not support listDrive in ' + process.platform);
  }
}
